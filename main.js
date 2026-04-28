const THREE = window.THREE;

const TAU = Math.PI * 2;
const WORLD_RADIUS = 92;
const CITY_RADIUS = 38;
const LOCK_DISTANCE = 22;
const LOCK_TIME = 0.28;

const dom = {
  root: document.getElementById("gameRoot"),
  canvas: document.getElementById("gameCanvas"),
  radar: document.getElementById("radarCanvas"),
  startOverlay: document.getElementById("startOverlay"),
  endOverlay: document.getElementById("endOverlay"),
  startButton: document.getElementById("startButton"),
  restartButton: document.getElementById("restartButton"),
  cityPercent: document.getElementById("cityPercent"),
  cityBar: document.getElementById("cityBar"),
  ammoText: document.getElementById("ammoText"),
  waveText: document.getElementById("waveText"),
  threatText: document.getElementById("threatText"),
  warningStack: document.getElementById("warningStack"),
  reticle: document.getElementById("reticle"),
  lockMeter: document.getElementById("lockMeter"),
  reloadChip: document.getElementById("reloadChip"),
  emergencyChip: document.getElementById("emergencyChip"),
  autoDroneButton: document.getElementById("autoDroneButton"),
  fullClearReadyPanel: document.getElementById("fullClearReadyPanel"),
  droneSweepOverlay: document.getElementById("droneSweepOverlay"),
  surgeCountdown: document.getElementById("surgeCountdown"),
  surgeCountdownText: document.getElementById("surgeCountdownText"),
  pressureChip: document.getElementById("pressureChip"),
  finalWave: document.getElementById("finalWave"),
  finalStats: document.getElementById("finalStats"),
  zones: {
    industrial: document.getElementById("industrialBar"),
    residential: document.getElementById("residentialBar"),
    military: document.getElementById("militaryBar")
  }
};

const missileProfiles = {
  ballistic: {
    name: "BALLISTIC",
    color: 0xff5367,
    trail: 0xff7f66,
    speed: 0.135,
    height: 58,
    damage: 14,
    radius: 2.1,
    lockPenalty: 0.74,
    score: 30
  },
  cruise: {
    name: "CRUISE",
    color: 0xffbd54,
    trail: 0xffdc77,
    speed: 0.075,
    height: 13,
    damage: 9,
    radius: 1.65,
    lockPenalty: 0.92,
    stealth: true,
    score: 22
  },
  drone: {
    name: "DRONE",
    color: 0x8affff,
    trail: 0x56f1ff,
    speed: 0.058,
    height: 9,
    damage: 4,
    radius: 1.1,
    lockPenalty: 1.2,
    score: 10
  },
  cluster: {
    name: "CLUSTER",
    color: 0xff7c35,
    trail: 0xff9542,
    speed: 0.096,
    height: 39,
    damage: 11,
    radius: 1.9,
    lockPenalty: 0.78,
    cluster: true,
    score: 38
  },
  warhead: {
    name: "WARHEAD",
    color: 0xff3a4c,
    trail: 0xff5a5a,
    speed: 0.13,
    height: 18,
    damage: 6,
    radius: 1.15,
    lockPenalty: 0.94,
    score: 14
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function makeMaterial(color, emissive = color, roughness = 0.58) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.12,
    roughness,
    metalness: 0.18
  });
}

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ready = false;
    this.nextSiren = 0;
    this.nextLock = 0;
  }

  start() {
    if (this.ready) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.34;
    this.master.connect(this.ctx.destination);

    const drone = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();
    drone.type = "sawtooth";
    drone.frequency.value = 43;
    droneGain.gain.value = 0.028;
    drone.connect(droneGain).connect(this.master);
    drone.start();

    this.ready = true;
  }

  tick(intensity, lockReady, lastStand) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const sirenGap = lastStand ? 0.62 : clamp(1.5 - intensity * 0.045, 0.72, 1.5);

    if (now >= this.nextSiren) {
      this.tone(lastStand ? 830 : 650, 0.32, "sine", 0.05 + intensity * 0.002);
      this.tone(lastStand ? 440 : 360, 0.34, "sine", 0.035);
      this.nextSiren = now + sirenGap;
    }

    if (lockReady && now >= this.nextLock) {
      this.tone(1320, 0.065, "square", 0.05);
      this.nextLock = now + 0.16;
    }
  }

  tone(freq, duration, type = "sine", gain = 0.06) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.65), now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  noise(duration = 0.36, gain = 0.17) {
    if (!this.ready) return;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const source = this.ctx.createBufferSource();
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    source.buffer = buffer;
    source.connect(amp).connect(this.master);
    source.start();
  }

  launch() {
    this.tone(210, 0.2, "sawtooth", 0.07);
    this.noise(0.18, 0.055);
  }

  explosion(scale = 1) {
    this.noise(0.42, 0.12 * scale);
    this.tone(72, 0.34, "triangle", 0.09 * scale);
  }

  emergency() {
    this.tone(102, 0.72, "sawtooth", 0.12);
    this.tone(1840, 0.18, "square", 0.035);
  }
}

class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  explosion(position, color = 0xff5d4d, scale = 1) {
    const group = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.2 * scale, 18, 12),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.8 * scale, 2 * scale, 48),
      new THREE.MeshBasicMaterial({
        color: 0xfff0a8,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    const light = new THREE.PointLight(color, 3 * scale, 36 * scale);
    ring.rotation.x = -Math.PI / 2;
    group.add(sphere, ring, light);
    group.position.copy(position);
    this.scene.add(group);
    this.items.push({ group, sphere, ring, light, age: 0, life: 0.78, scale });
  }

  shockwave(position, radius, color = 0x57f7ff) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.22, 96),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    mesh.position.y = 0.22;
    this.scene.add(mesh);
    this.items.push({ group: mesh, ring: mesh, age: 0, life: 0.58, maxRadius: radius, shock: true });
  }

  droneStrike(start, end) {
    const group = new THREE.Group();
    const beamMaterial = new THREE.LineBasicMaterial({
      color: 0x66ff9a,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    for (let i = 0; i < 3; i += 1) {
      const offset = new THREE.Vector3(rand(-1.4, 1.4), rand(-0.4, 0.8), rand(-1.4, 1.4));
      const geometry = new THREE.BufferGeometry().setFromPoints([start.clone().add(offset), end.clone().sub(offset)]);
      group.add(new THREE.Line(geometry, beamMaterial.clone()));
    }

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.1, 36),
      new THREE.MeshBasicMaterial({
        color: 0x66ff9a,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.copy(end);
    group.add(marker);

    this.scene.add(group);
    this.items.push({ group, beamGroup: group, marker, age: 0, life: 1.25 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const fx = this.items[i];
      fx.age += dt;
      const t = fx.age / fx.life;

      if (fx.beamGroup) {
        fx.beamGroup.children.forEach((child) => {
          if (child.material) child.material.opacity = Math.max(0, 0.96 * (1 - t));
        });
        fx.marker.scale.setScalar(1 + t * 5);
      } else if (fx.shock) {
        const s = 1 + fx.maxRadius * t;
        fx.group.scale.setScalar(s);
        fx.group.material.opacity = Math.max(0, 0.8 * (1 - t));
      } else {
        const s = fx.scale * (1 + t * 10);
        fx.sphere.scale.setScalar(s);
        fx.sphere.material.opacity = Math.max(0, 0.82 * (1 - t));
        fx.ring.scale.setScalar(1 + t * 15);
        fx.ring.material.opacity = Math.max(0, 0.76 * (1 - t));
        fx.light.intensity = Math.max(0, 3 * fx.scale * (1 - t));
      }

      if (t >= 1) {
        this.scene.remove(fx.group);
        this.items.splice(i, 1);
      }
    }
  }
}

class CitySystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.buildings = [];
    this.zones = [
      {
        key: "industrial",
        label: "Industrial",
        center: new THREE.Vector2(-25, 1),
        size: new THREE.Vector2(28, 30),
        color: 0x5f9ea0,
        health: 100
      },
      {
        key: "residential",
        label: "Residential",
        center: new THREE.Vector2(3, -4),
        size: new THREE.Vector2(32, 36),
        color: 0x8ac6ff,
        health: 100
      },
      {
        key: "military",
        label: "Military",
        center: new THREE.Vector2(26, 8),
        size: new THREE.Vector2(24, 26),
        color: 0x9cff7d,
        health: 100
      }
    ];

    this.createGround();
    this.createCity();
    this.scene.add(this.group);
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(210, 210, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x060c12,
        roughness: 0.9,
        metalness: 0.05
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    const grid = new THREE.GridHelper(190, 38, 0x18485a, 0x0c2732);
    grid.position.y = 0.03;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    this.group.add(grid);

    for (let r = 20; r <= 86; r += 22) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.04, r + 0.04, 128),
        new THREE.MeshBasicMaterial({
          color: 0x57f7ff,
          transparent: true,
          opacity: r === 86 ? 0.32 : 0.18,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      this.group.add(ring);
    }
  }

  createCity() {
    const roadMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a2c35,
      transparent: true,
      opacity: 0.72
    });

    for (let i = -42; i <= 42; i += 14) {
      const roadA = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 72), roadMaterial);
      roadA.position.set(i, 0.08, 0);
      this.group.add(roadA);
      const roadB = new THREE.Mesh(new THREE.BoxGeometry(72, 0.08, 2.2), roadMaterial);
      roadB.position.set(0, 0.09, i);
      this.group.add(roadB);
    }

    this.zones.forEach((zone) => {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(zone.size.x, 0.12, zone.size.y),
        new THREE.MeshBasicMaterial({
          color: zone.color,
          transparent: true,
          opacity: 0.075,
          blending: THREE.AdditiveBlending
        })
      );
      pad.position.set(zone.center.x, 0.12, zone.center.y);
      this.group.add(pad);

      const count = zone.key === "residential" ? 34 : 22;
      for (let i = 0; i < count; i += 1) {
        const width = rand(2.2, zone.key === "industrial" ? 5.5 : 4.2);
        const depth = rand(2.2, zone.key === "industrial" ? 6.2 : 4.2);
        const height = rand(3, zone.key === "military" ? 12 : 18);
        const x = zone.center.x + rand(-zone.size.x * 0.42, zone.size.x * 0.42);
        const z = zone.center.y + rand(-zone.size.y * 0.42, zone.size.y * 0.42);

        const mat = makeMaterial(zone.color, zone.color);
        mat.emissiveIntensity = rand(0.08, 0.22);
        const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
        building.position.set(x, height / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        building.userData.zone = zone.key;
        building.userData.fullHeight = height;
        building.userData.baseColor = new THREE.Color(zone.color);
        this.group.add(building);
        this.buildings.push(building);

        if (Math.random() < 0.55) {
          const light = new THREE.Mesh(
            new THREE.PlaneGeometry(width * 0.65, 0.08),
            new THREE.MeshBasicMaterial({
              color: 0xeaffff,
              transparent: true,
              opacity: rand(0.35, 0.75),
              blending: THREE.AdditiveBlending
            })
          );
          light.position.set(x, height + 0.05, z);
          light.rotation.x = -Math.PI / 2;
          this.group.add(light);
        }
      }
    });

    const batteryMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c252b,
      emissive: 0x57f7ff,
      emissiveIntensity: 0.35,
      roughness: 0.42,
      metalness: 0.4
    });
    this.batteries = [
      new THREE.Vector3(-38, 0.6, -35),
      new THREE.Vector3(38, 0.6, -32),
      new THREE.Vector3(-2, 0.6, 39)
    ];
    this.batteries.forEach((pos) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.1, 1.2, 12), batteryMaterial);
      base.position.copy(pos);
      base.castShadow = true;
      this.group.add(base);
      const antenna = new THREE.Mesh(new THREE.ConeGeometry(1, 4, 12), batteryMaterial);
      antenna.position.copy(pos);
      antenna.position.y += 2.4;
      this.group.add(antenna);
    });
  }

  reset() {
    this.zones.forEach((zone) => {
      zone.health = 100;
    });
    this.buildings.forEach((building) => {
      building.scale.y = 1;
      building.material.color.copy(building.userData.baseColor);
      building.material.emissiveIntensity = 0.16;
    });
    this.updateHud();
  }

  getHealth() {
    return this.zones.reduce((sum, zone) => sum + zone.health, 0) / this.zones.length;
  }

  destroyedZones() {
    return this.zones.filter((zone) => zone.health <= 0).length;
  }

  getTarget() {
    const available = this.zones.filter((zone) => zone.health > 0);
    const zone = choose(available.length ? available : this.zones);
    return {
      zone,
      position: new THREE.Vector3(
        zone.center.x + rand(-zone.size.x * 0.5, zone.size.x * 0.5),
        0,
        zone.center.y + rand(-zone.size.y * 0.5, zone.size.y * 0.5)
      )
    };
  }

  damageAt(position, damage, effects) {
    const zone = this.zones
      .map((item) => ({
        item,
        dist: new THREE.Vector2(position.x, position.z).distanceTo(item.center)
      }))
      .sort((a, b) => a.dist - b.dist)[0].item;

    zone.health = clamp(zone.health - damage, 0, 100);
    effects.explosion(position.clone().setY(1.2), 0xff5d4d, 1.6 + damage * 0.07);

    this.buildings.forEach((building) => {
      if (building.userData.zone !== zone.key) return;
      const d = building.position.distanceTo(position);
      if (d < 14) {
        building.scale.y = Math.max(0.12, building.scale.y - (14 - d) * damage * 0.006);
        building.material.emissiveIntensity = 0.02;
        building.material.color.lerp(new THREE.Color(0x151515), 0.22);
      }
    });

    this.updateHud();
    return zone;
  }

  updateHud() {
    const health = Math.round(this.getHealth());
    dom.cityPercent.textContent = `${health}%`;
    dom.cityBar.style.width = `${health}%`;
    dom.cityBar.style.background =
      health < 30
        ? "linear-gradient(90deg, #ff4d5e, #ffbd54)"
        : "linear-gradient(90deg, #66ff9a, #57f7ff)";

    this.zones.forEach((zone) => {
      const bar = dom.zones[zone.key];
      bar.style.width = `${zone.health}%`;
      bar.style.background =
        zone.health < 28
          ? "linear-gradient(90deg, #ff4d5e, #ffbd54)"
          : "linear-gradient(90deg, #66ff9a, #57f7ff)";
    });
  }
}

class Missile {
  constructor(type, start, target, wave, parentVelocity = null) {
    this.id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
    this.type = type;
    this.profile = missileProfiles[type];
    this.start = start.clone();
    this.position = start.clone();
    this.target = target.position.clone();
    this.zone = target.zone;
    this.progress = 0;
    this.dead = false;
    this.split = false;
    this.wave = wave;
    this.phase = Math.random() * TAU;
    this.speed = this.profile.speed * rand(0.9, 1.18) * (1 + wave * 0.035);
    if (parentVelocity) this.speed *= 1.04;
    this.lock = 0;

    const geometry =
      type === "drone"
        ? new THREE.SphereGeometry(this.profile.radius, 8, 6)
        : new THREE.ConeGeometry(this.profile.radius * 0.58, this.profile.radius * 2.8, 12);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: this.profile.color,
        transparent: true,
        opacity: type === "cruise" ? 0.74 : 0.95
      })
    );
    this.mesh.position.copy(this.position);

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([this.position, this.position]);
    this.trail = new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: this.profile.trail,
        transparent: true,
        opacity: type === "cruise" ? 0.34 : 0.62,
        blending: THREE.AdditiveBlending
      })
    );

    const predictionGeometry = new THREE.BufferGeometry().setFromPoints(this.predictionPoints());
    this.prediction = new THREE.Line(
      predictionGeometry,
      new THREE.LineDashedMaterial({
        color: this.profile.trail,
        transparent: true,
        opacity: 0.2,
        dashSize: 2.2,
        gapSize: 1.4
      })
    );
    this.prediction.computeLineDistances();
    this.trailPoints = [];
  }

  predictionPoints() {
    const points = [];
    for (let i = 0; i <= 16; i += 1) {
      points.push(this.sample(i / 16));
    }
    return points;
  }

  sample(progress) {
    const p = clamp(progress, 0, 1);
    const pos = this.start.clone().lerp(this.target, p);
    const wobble = this.type === "cruise" || this.type === "drone" ? Math.sin(p * 8 + this.phase) * 3 : 0;
    const side = new THREE.Vector3(-(this.target.z - this.start.z), 0, this.target.x - this.start.x)
      .normalize()
      .multiplyScalar(wobble);
    pos.add(side);
    const arc = Math.sin(Math.PI * p) * this.profile.height;
    const lowDrift = this.type === "drone" ? Math.sin(p * 20 + this.phase) * 1.5 : 0;
    pos.y = Math.max(0.9, arc + lowDrift + (this.type === "warhead" ? 4 * (1 - p) : 0));
    return pos;
  }

  update(dt) {
    this.progress += this.speed * dt;
    const next = this.sample(this.progress);
    const direction = next.clone().sub(this.position).normalize();
    this.position.copy(next);
    this.mesh.position.copy(this.position);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.mesh.rotation.z += this.type === "drone" ? dt * 12 : 0;

    this.trailPoints.push(this.position.clone());
    if (this.trailPoints.length > 24) this.trailPoints.shift();
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints);

    if (this.prediction.material.opacity > 0) {
      this.prediction.material.opacity = Math.max(0, this.prediction.material.opacity - dt * 0.035);
    }

    return this.progress >= 1;
  }
}

class MissileSystem {
  constructor(scene, city, effects, audio) {
    this.scene = scene;
    this.city = city;
    this.effects = effects;
    this.audio = audio;
    this.missiles = [];
    this.wave = 1;
    this.elapsed = 0;
    this.spawnTimer = 1;
    this.surgeTimer = 22;
    this.surgeCountdown = 0;
    this.surgeCountdownSecond = 0;
    this.surgeBatchId = 0;
    this.fullClearReady = false;
    this.fullClearArmTimer = 0;
    this.jamTimer = 0;
    this.nextJam = 18;
  }

  reset() {
    this.missiles.forEach((missile) => this.removeMissile(missile));
    this.missiles = [];
    this.wave = 1;
    this.elapsed = 0;
    this.spawnTimer = 2.25;
    this.surgeTimer = 24;
    this.surgeCountdown = 0;
    this.surgeCountdownSecond = 0;
    this.surgeBatchId += 1;
    this.fullClearReady = false;
    this.fullClearArmTimer = 0;
    this.jamTimer = 0;
    this.nextJam = 16;
    dom.surgeCountdown.hidden = true;
  }

  addMissile(type, start = null, target = null) {
    const angle = rand(0, TAU);
    const spawn = start
      ? start.clone()
      : new THREE.Vector3(Math.cos(angle) * WORLD_RADIUS, rand(5, 15), Math.sin(angle) * WORLD_RADIUS);
    const missile = new Missile(type, spawn, target || this.city.getTarget(), this.wave);
    this.missiles.push(missile);
    this.scene.add(missile.mesh, missile.trail, missile.prediction);
    return missile;
  }

  removeMissile(missile) {
    this.scene.remove(missile.mesh, missile.trail, missile.prediction);
    missile.mesh.geometry.dispose();
    missile.mesh.material.dispose();
    missile.trail.geometry.dispose();
    missile.trail.material.dispose();
    missile.prediction.geometry.dispose();
    missile.prediction.material.dispose();
    missile.dead = true;
  }

  spawnWeighted() {
    const roll = Math.random();
    const pressure = this.wave;
    if (roll < 0.22 + pressure * 0.006) return "ballistic";
    if (roll < 0.44) return "cruise";
    if (roll < 0.74) return "drone";
    return "cluster";
  }

  surge() {
    const amount = 9 + Math.min(18, Math.floor(this.wave * 1.8));
    const batch = this.surgeBatchId;
    for (let i = 0; i < amount; i += 1) {
      setTimeout(() => {
        if (batch === this.surgeBatchId) this.addMissile(this.spawnWeighted());
      }, i * 120);
    }
    this.fullClearReady = false;
    this.fullClearArmTimer = 6.0;
    this.effects.shockwave(new THREE.Vector3(0, 0, 0), 88, 0xff4d5e);
  }

  updateFullClearArming(dt) {
    if (this.fullClearArmTimer <= 0) return;
    this.fullClearArmTimer = Math.max(0, this.fullClearArmTimer - dt);
    if (this.fullClearArmTimer <= 0) {
      this.fullClearReady = true;
      this.audio.tone(1680, 0.16, "square", 0.045);
    }
  }

  startSurgeCountdown() {
    this.surgeCountdown = 3.05;
    this.surgeCountdownSecond = 0;
    dom.surgeCountdown.hidden = false;
  }

  updateSurgeCountdown(dt) {
    if (this.surgeCountdown <= 0) {
      this.surgeTimer -= dt;
      if (this.surgeTimer <= 0) this.startSurgeCountdown();
      return;
    }

    this.surgeCountdown = Math.max(0, this.surgeCountdown - dt);
    const seconds = Math.max(1, Math.ceil(this.surgeCountdown));
    dom.surgeCountdownText.textContent = String(seconds);

    if (seconds !== this.surgeCountdownSecond) {
      this.surgeCountdownSecond = seconds;
      this.audio.tone(260 + seconds * 110, 0.18, "square", 0.055);
    }

    if (this.surgeCountdown <= 0) {
      dom.surgeCountdown.hidden = true;
      this.surge();
      this.surgeTimer = clamp(46 - this.wave * 1.4, 22, 46);
    }
  }

  warn(text) {
    const item = document.createElement("div");
    item.className = "warning";
    item.textContent = text;
    dom.warningStack.appendChild(item);
    setTimeout(() => item.remove(), 1500);
  }

  update(dt) {
    this.elapsed += dt;
    this.wave = 1 + Math.floor(this.elapsed / 36);
    const deadZones = this.city.destroyedZones();
    const interval = clamp(2.7 - this.wave * 0.085 - deadZones * 0.16, 0.62, 2.7);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.addMissile(this.spawnWeighted());
      if (Math.random() < 0.16 + this.wave * 0.008) {
        this.addMissile(this.spawnWeighted());
      }
      if (Math.random() < 0.08 + this.wave * 0.004) {
        const swarmSize = Math.floor(rand(2, 4));
        for (let i = 0; i < swarmSize; i += 1) this.addMissile("drone");
      }
      this.spawnTimer = interval * rand(0.82, 1.24);
    }

    this.updateSurgeCountdown(dt);
    this.updateFullClearArming(dt);

    this.nextJam -= dt;
    if (this.nextJam <= 0 && this.jamTimer <= 0 && Math.random() < 0.65) {
      this.jamTimer = rand(2.2, 4.8);
      this.nextJam = rand(14, 25);
      this.warn("RADAR JAMMED");
    }
    this.jamTimer = Math.max(0, this.jamTimer - dt);

    for (let i = this.missiles.length - 1; i >= 0; i -= 1) {
      const missile = this.missiles[i];
      const hit = missile.update(dt);

      if (missile.type === "cluster" && !missile.swept && !missile.split && missile.progress > 0.56) {
        missile.split = true;
        for (let j = 0; j < 4; j += 1) {
          const target = this.city.getTarget();
          target.position.add(new THREE.Vector3(rand(-12, 12), 0, rand(-12, 12)));
          const child = this.addMissile("warhead", missile.position.clone(), target);
          child.progress = 0.08;
        }
        this.effects.explosion(missile.position, 0xffbd54, 0.7);
        this.removeMissile(missile);
        this.missiles.splice(i, 1);
        continue;
      }

      if (hit) {
        this.city.damageAt(missile.target, missile.profile.damage, this.effects);
        this.audio.explosion(1.1);
        this.removeMissile(missile);
        this.missiles.splice(i, 1);
      }
    }

    dom.waveText.textContent = String(this.wave);
    dom.threatText.textContent = String(this.missiles.length);
  }
}

class Interceptor {
  constructor(start, target) {
    this.position = start.clone();
    this.velocity = target.position.clone().sub(start).normalize().multiplyScalar(46);
    this.target = target;
    this.life = 4.4;
    this.dead = false;
    this.hit = false;

    this.mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.58, 2.5, 12),
      new THREE.MeshBasicMaterial({ color: 0x66ff9a })
    );
    this.mesh.position.copy(this.position);

    this.trailPoints = [this.position.clone()];
    this.trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this.trailPoints),
      new THREE.LineBasicMaterial({
        color: 0x66ff9a,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending
      })
    );
  }

  update(dt) {
    if (!this.target || this.target.dead) {
      this.life -= dt * 2;
    } else {
      const desired = this.target.position.clone().sub(this.position).normalize().multiplyScalar(64);
      this.velocity.lerp(desired, clamp(dt * 2.8, 0, 0.28));
      this.position.addScaledVector(this.velocity, dt);
      if (this.position.distanceTo(this.target.position) < 2.8) {
        this.hit = true;
        this.dead = true;
      }
    }

    this.life -= dt;
    this.mesh.position.copy(this.position);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.velocity.clone().normalize());
    this.trailPoints.push(this.position.clone());
    if (this.trailPoints.length > 18) this.trailPoints.shift();
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints);

    if (this.life <= 0 || this.position.length() > 130) this.dead = true;
  }
}

class DefenseSystem {
  constructor(scene, city, missileSystem, effects, audio) {
    this.scene = scene;
    this.city = city;
    this.missileSystem = missileSystem;
    this.effects = effects;
    this.audio = audio;
    this.interceptors = [];
    this.ammoMax = 18;
    this.ammo = this.ammoMax;
    this.reload = 0;
    this.cooldown = 0;
    this.emergencyCooldown = 0;
    this.autoDroneCooldown = 0;
    this.sweepBatchId = 0;
    this.lockTarget = null;
    this.lockProgress = 0;
    this.score = 0;
    this.batteryIndex = 0;
  }

  reset() {
    this.interceptors.forEach((item) => this.removeInterceptor(item));
    this.interceptors = [];
    this.ammo = this.ammoMax;
    this.reload = 0;
    this.cooldown = 0;
    this.emergencyCooldown = 0;
    this.autoDroneCooldown = 0;
    this.sweepBatchId += 1;
    this.lockTarget = null;
    this.lockProgress = 0;
    this.score = 0;
    dom.fullClearReadyPanel.hidden = true;
    dom.droneSweepOverlay.hidden = true;
    this.updateHud();
  }

  removeInterceptor(item) {
    this.scene.remove(item.mesh, item.trail);
    item.mesh.geometry.dispose();
    item.mesh.material.dispose();
    item.trail.geometry.dispose();
    item.trail.material.dispose();
  }

  pickTarget(mouseWorld, jammed) {
    if (!mouseWorld || jammed) return null;
    let best = null;
    let bestDist = Infinity;
    this.missileSystem.missiles.forEach((missile) => {
      const ground = new THREE.Vector3(missile.position.x, 0, missile.position.z);
      const dist = ground.distanceTo(mouseWorld);
      const stealthBoost = missile.profile.stealth ? 1.32 : 1;
      if (dist < LOCK_DISTANCE * stealthBoost && dist < bestDist) {
        best = missile;
        bestDist = dist;
      }
    });
    return best;
  }

  update(dt, mouseWorld, lastStand) {
    const jammed = this.missileSystem.jamTimer > 0;
    const target = this.pickTarget(mouseWorld, jammed);
    if (target && target === this.lockTarget) {
      this.lockProgress += dt * target.profile.lockPenalty * (lastStand ? 1.28 : 1);
    } else if (target) {
      this.lockTarget = target;
      this.lockProgress = Math.max(0.08, this.lockProgress * 0.25);
    } else {
      this.lockProgress = Math.max(0, this.lockProgress - dt * 1.6);
      if (this.lockProgress <= 0) this.lockTarget = null;
    }
    this.lockProgress = clamp(this.lockProgress, 0, LOCK_TIME);

    this.reload -= dt;
    this.cooldown -= dt;
    this.emergencyCooldown -= dt;
    this.autoDroneCooldown -= dt;
    if (this.reload <= 0 && this.ammo < this.ammoMax) {
      this.ammo += 1;
      this.reload = lastStand ? 0.54 : 0.95;
    }

    for (let i = this.interceptors.length - 1; i >= 0; i -= 1) {
      const interceptor = this.interceptors[i];
      interceptor.update(dt);
      if (interceptor.dead) {
        if (interceptor.hit && interceptor.target && !interceptor.target.dead) {
          this.effects.explosion(interceptor.target.position, 0x66ff9a, 0.9);
          this.audio.explosion(0.62);
          this.score += interceptor.target.profile.score;
          const index = this.missileSystem.missiles.indexOf(interceptor.target);
          if (index >= 0) this.missileSystem.missiles.splice(index, 1);
          this.missileSystem.removeMissile(interceptor.target);
        }
        this.removeInterceptor(interceptor);
        this.interceptors.splice(i, 1);
      }
    }

    this.updateHud();
  }

  launch(mouseWorld = null) {
    const snapTarget = this.pickTarget(mouseWorld, this.missileSystem.jamTimer > 0);
    if (snapTarget) {
      this.lockTarget = snapTarget;
      this.lockProgress = LOCK_TIME;
    }

    if (this.ammo <= 0 || this.cooldown > 0 || this.lockProgress < LOCK_TIME || !this.lockTarget) {
      this.audio.tone(120, 0.08, "square", 0.04);
      return;
    }
    const start = this.city.batteries[this.batteryIndex % this.city.batteries.length].clone();
    this.batteryIndex += 1;
    const interceptor = new Interceptor(start, this.lockTarget);
    this.interceptors.push(interceptor);
    this.scene.add(interceptor.mesh, interceptor.trail);
    this.ammo -= 1;
    this.cooldown = 0.18;
    this.reload = Math.min(this.reload || 0.95, 0.95);
    this.lockProgress = 0;
    this.audio.launch();
  }

  emergency(mouseWorld) {
    if (this.emergencyCooldown > 0) {
      this.audio.tone(92, 0.12, "square", 0.035);
      return;
    }

    const center = mouseWorld ? mouseWorld.clone() : new THREE.Vector3();
    const radius = 24;
    this.effects.shockwave(center, radius, 0xffbd54);
    this.audio.emergency();
    this.emergencyCooldown = 14;

    for (let i = this.missileSystem.missiles.length - 1; i >= 0; i -= 1) {
      const missile = this.missileSystem.missiles[i];
      const ground = new THREE.Vector3(missile.position.x, 0, missile.position.z);
      if (ground.distanceTo(center) <= radius) {
        if (missile.type === "ballistic" || missile.type === "cluster") {
          missile.progress -= 0.1;
          missile.speed *= 0.72;
          missile.mesh.material.color.setHex(0xffbd54);
        } else {
          this.effects.explosion(missile.position, 0xffbd54, 0.62);
          this.missileSystem.removeMissile(missile);
          this.missileSystem.missiles.splice(i, 1);
          this.score += 8;
        }
      }
    }
  }

  canUseAutoDrones() {
    return this.autoDroneCooldown <= 0 && this.missileSystem.fullClearReady && this.missileSystem.missiles.length > 0;
  }

  autoDroneSweep() {
    if (!this.canUseAutoDrones()) {
      this.audio.tone(104, 0.12, "square", 0.035);
      return;
    }

    const targets = [...this.missileSystem.missiles]
      .sort((a, b) => {
        const aGround = new THREE.Vector3(a.position.x, 0, a.position.z);
        const bGround = new THREE.Vector3(b.position.x, 0, b.position.z);
        return aGround.length() - bGround.length();
      })
      .slice(0, 6);
    const sweepBatch = this.sweepBatchId + 1;
    this.sweepBatchId = sweepBatch;
    this.autoDroneCooldown = 36;
    this.missileSystem.fullClearReady = false;
    this.missileSystem.fullClearArmTimer = 0;
    dom.fullClearReadyPanel.hidden = true;
    dom.droneSweepOverlay.hidden = false;
    this.effects.shockwave(new THREE.Vector3(0, 0, 0), 92, 0x66ff9a);
    this.effects.shockwave(new THREE.Vector3(0, 0, 0), 54, 0x57f7ff);
    this.audio.emergency();
    this.audio.noise(0.54, 0.1);

    targets.forEach((missile, index) => {
      if (missile.dead) return;
      missile.swept = true;
      missile.progress = Math.min(missile.progress, 0.86);
      missile.speed *= 0.12;
      missile.mesh.material.color.setHex(0x66ff9a);
      const start = this.city.batteries[index % this.city.batteries.length].clone();
      start.y += 3 + (index % 3) * 0.8;
      const delay = Math.min(1900, index * 95);
      setTimeout(() => {
        if (sweepBatch !== this.sweepBatchId || missile.dead) return;
        const end = missile.position.clone();
        this.effects.droneStrike(start, end);
        this.effects.explosion(end, 0x66ff9a, missile.type === "ballistic" || missile.type === "cluster" ? 1.05 : 0.76);
        this.audio.tone(980 + (index % 5) * 90, 0.08, "square", 0.025);
        this.score += missile.profile.score;
        const missileIndex = this.missileSystem.missiles.indexOf(missile);
        if (missileIndex >= 0) this.missileSystem.missiles.splice(missileIndex, 1);
        this.missileSystem.removeMissile(missile);
        this.updateHud();
      }, delay);
    });

    setTimeout(() => {
      if (sweepBatch !== this.sweepBatchId) return;
      dom.droneSweepOverlay.hidden = true;
      this.missileSystem.missiles = this.missileSystem.missiles.filter((missile) => !missile.dead);
      this.updateHud();
    }, 2450);
    this.updateHud();
  }

  updateHud() {
    const autoReady = this.canUseAutoDrones();
    dom.ammoText.textContent = `${this.ammo}/${this.ammoMax}`;
    dom.reloadChip.textContent =
      this.ammo > 0 && this.cooldown <= 0 ? "RELOAD READY" : this.ammo <= 0 ? "RELOADING" : "LAUNCH COOLING";
    dom.emergencyChip.textContent =
      this.emergencyCooldown <= 0 ? "EMERGENCY READY" : `EMERGENCY ${Math.ceil(this.emergencyCooldown)}S`;
    dom.autoDroneButton.disabled = !autoReady;
    dom.autoDroneButton.textContent = autoReady
      ? "FULL CLEAR [F]"
      : this.autoDroneCooldown > 0
        ? `F ${Math.ceil(this.autoDroneCooldown)}S`
        : this.missileSystem.fullClearArmTimer > 0
          ? `F ARMING ${Math.ceil(this.missileSystem.fullClearArmTimer)}`
        : this.missileSystem.fullClearReady
          ? "F WAIT"
          : "F AFTER SURGE";
    dom.fullClearReadyPanel.hidden = !autoReady;
    const angle = (this.lockProgress / LOCK_TIME) * 360;
    dom.lockMeter.style.setProperty("--lock", `${angle}deg`);
  }
}

class Radar {
  constructor(canvas, city, missileSystem, defense) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.city = city;
    this.missileSystem = missileSystem;
    this.defense = defense;
    this.zoom = 1;
  }

  worldToRadar(vec) {
    const rect = this.canvas;
    const scale = (rect.width * 0.42 * this.zoom) / WORLD_RADIUS;
    return {
      x: rect.width / 2 + vec.x * scale,
      y: rect.height / 2 + vec.z * scale
    };
  }

  draw(mouseWorld, jammed, slowMo, lastStand) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle = jammed ? "rgba(18, 4, 7, 0.88)" : "rgba(0, 14, 18, 0.84)";
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = jammed ? "rgba(255,77,94,.28)" : "rgba(87,247,255,.22)";
    ctx.lineWidth = 1;
    for (let r = 38; r < w * 0.5; r += 38) {
      ctx.beginPath();
      ctx.arc(0, 0, r * this.zoom, 0, TAU);
      ctx.stroke();
    }
    for (let a = 0; a < TAU; a += Math.PI / 6) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * w, Math.sin(a) * w);
      ctx.stroke();
    }
    ctx.restore();

    this.city.zones.forEach((zone) => {
      const p = this.worldToRadar({ x: zone.center.x, z: zone.center.y });
      const sx = (zone.size.x / WORLD_RADIUS) * w * 0.22 * this.zoom;
      const sy = (zone.size.y / WORLD_RADIUS) * h * 0.22 * this.zoom;
      ctx.fillStyle = zone.health < 30 ? "rgba(255,77,94,.2)" : "rgba(102,255,154,.13)";
      ctx.strokeStyle = zone.health < 30 ? "rgba(255,77,94,.55)" : "rgba(102,255,154,.38)";
      ctx.fillRect(p.x - sx / 2, p.y - sy / 2, sx, sy);
      ctx.strokeRect(p.x - sx / 2, p.y - sy / 2, sx, sy);
    });

    this.missileSystem.missiles.forEach((missile) => {
      const p = this.worldToRadar(missile.position);
      const t = this.worldToRadar(missile.target);
      const hidden = jammed && missile.profile.stealth && Math.random() < 0.72;
      if (hidden) return;
      ctx.strokeStyle = missile.type === "drone" ? "rgba(87,247,255,.34)" : "rgba(255,83,103,.34)";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.fillStyle =
        missile === this.defense.lockTarget
          ? "#ffffff"
          : missile.type === "drone"
            ? "#57f7ff"
            : missile.type === "cruise"
              ? "#ffbd54"
              : "#ff4d5e";
      ctx.beginPath();
      ctx.arc(p.x, p.y, missile === this.defense.lockTarget ? 5 : 3.2, 0, TAU);
      ctx.fill();
    });

    this.defense.interceptors.forEach((interceptor) => {
      const p = this.worldToRadar(interceptor.position);
      ctx.fillStyle = "#66ff9a";
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });

    if (mouseWorld) {
      const p = this.worldToRadar(mouseWorld);
      ctx.strokeStyle = "#eaffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, LOCK_DISTANCE * this.zoom, 0, TAU);
      ctx.stroke();
    }

    if (jammed) {
      for (let i = 0; i < 140; i += 1) {
        ctx.fillStyle = `rgba(255,77,94,${Math.random() * 0.28})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, rand(1, 11), 1);
      }
    }

    ctx.fillStyle = lastStand ? "#ff4d5e" : slowMo ? "#ffbd54" : "#57f7ff";
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.fillText(jammed ? "JAMMING" : slowMo ? "TIME DILATION" : "RADAR", 14, 24);
    ctx.restore();
  }
}

class GameEngine {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02050b);
    this.scene.fog = new THREE.FogExp2(0x03080f, 0.009);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 420);
    this.camera.position.set(0, 84, 104);
    this.camera.lookAt(0, 0, 0);
    this.zoom = 1;

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.mouseNdc = new THREE.Vector2();
    this.mouseWorld = new THREE.Vector3();
    this.mouseValid = false;
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.running = false;
    this.lastStand = false;
    this.kills = 0;

    this.audio = new AudioManager();
    this.effects = new Effects(this.scene);
    this.city = new CitySystem(this.scene);
    this.missiles = new MissileSystem(this.scene, this.city, this.effects, this.audio);
    this.defense = new DefenseSystem(this.scene, this.city, this.missiles, this.effects, this.audio);
    this.radar = new Radar(dom.radar, this.city, this.missiles, this.defense);

    this.createLighting();
    this.createSkyFlashes();
    this.bindEvents();
    this.resize();
    this.reset();
    requestAnimationFrame(() => this.animate());
  }

  createLighting() {
    const ambient = new THREE.AmbientLight(0x8cbcff, 0.28);
    this.scene.add(ambient);

    const moon = new THREE.DirectionalLight(0xc7e8ff, 0.9);
    moon.position.set(-38, 80, 50);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -90;
    moon.shadow.camera.right = 90;
    moon.shadow.camera.top = 90;
    moon.shadow.camera.bottom = -90;
    this.scene.add(moon);

    this.flashLight = new THREE.PointLight(0xff596b, 0, 150);
    this.flashLight.position.set(0, 42, -30);
    this.scene.add(this.flashLight);
  }

  createSkyFlashes() {
    const stars = new THREE.BufferGeometry();
    const points = [];
    for (let i = 0; i < 700; i += 1) {
      const angle = rand(0, TAU);
      const radius = rand(80, 190);
      points.push(Math.cos(angle) * radius, rand(54, 142), Math.sin(angle) * radius);
    }
    stars.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const starField = new THREE.Points(
      stars,
      new THREE.PointsMaterial({
        color: 0xcbefff,
        size: 0.55,
        transparent: true,
        opacity: 0.55
      })
    );
    this.scene.add(starField);
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointermove", (event) => this.onPointerMove(event));
    window.addEventListener("mousedown", (event) => {
      if (!this.running) return;
      if (event.button === 0) this.defense.launch(this.mouseValid ? this.mouseWorld : null);
      if (event.button === 2) this.defense.emergency(this.mouseValid ? this.mouseWorld : null);
    });
    window.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener(
      "wheel",
      (event) => {
        this.zoom = clamp(this.zoom + Math.sign(event.deltaY) * 0.08, 0.76, 1.4);
        this.applyZoom();
      },
      { passive: true }
    );
    window.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=") {
        this.zoom = clamp(this.zoom - 0.08, 0.76, 1.4);
        this.applyZoom();
      }
      if (event.key === "-" || event.key === "_") {
        this.zoom = clamp(this.zoom + 0.08, 0.76, 1.4);
        this.applyZoom();
      }
      if (event.key.toLowerCase() === "r" && !this.running) this.start();
      if (event.key.toLowerCase() === "f" && this.running) {
        this.defense.autoDroneSweep();
      }
    });

    dom.startButton.addEventListener("click", () => this.start());
    dom.restartButton.addEventListener("click", () => this.start());
    dom.autoDroneButton.addEventListener("mousedown", (event) => event.stopPropagation());
    dom.autoDroneButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (this.running) this.defense.autoDroneSweep();
    });
  }

  onPointerMove(event) {
    const x = event.clientX;
    const y = event.clientY;
    dom.reticle.style.transform = `translate3d(${x - window.innerWidth / 2}px, ${y - window.innerHeight / 2}px, 0)`;
    this.mouseNdc.x = (x / window.innerWidth) * 2 - 1;
    this.mouseNdc.y = -(y / window.innerHeight) * 2 + 1;
    this.updateMouseWorld();
  }

  updateMouseWorld() {
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    this.mouseValid = this.raycaster.ray.intersectPlane(this.groundPlane, this.mouseWorld) !== null;
    if (this.mouseValid) {
      this.mouseWorld.y = 0;
    }
  }

  applyZoom() {
    this.camera.position.set(0, 84 * this.zoom, 104 * this.zoom);
    this.camera.lookAt(0, 0, 0);
    this.radar.zoom = clamp(1.55 - this.zoom * 0.55, 0.72, 1.18);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const radarRect = dom.radar.getBoundingClientRect();
    const size = Math.max(180, Math.round(Math.min(radarRect.width || 360, radarRect.height || 360)));
    dom.radar.width = size;
    dom.radar.height = size;
    this.updateMouseWorld();
  }

  reset() {
    this.city.reset();
    this.missiles.reset();
    this.defense.reset();
    this.kills = 0;
    this.lastStand = false;
    dom.root.classList.remove("lastStand");
    dom.endOverlay.hidden = true;
  }

  start() {
    this.audio.start();
    this.reset();
    this.running = true;
    dom.startOverlay.style.display = "none";
    dom.endOverlay.hidden = true;
    this.clock.getDelta();
    for (let i = 0; i < 3; i += 1) this.missiles.addMissile(i % 2 ? "drone" : "cruise");
  }

  end() {
    this.running = false;
    dom.surgeCountdown.hidden = true;
    dom.droneSweepOverlay.hidden = true;
    dom.fullClearReadyPanel.hidden = true;
    dom.finalWave.textContent = `Wave ${this.missiles.wave}`;
    dom.finalStats.textContent = `Interceptions: ${Math.round(this.defense.score)}. City integrity reached 0%.`;
    dom.endOverlay.hidden = false;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const rawDt = Math.min(0.05, this.clock.getDelta());
    const pressure = this.missiles.missiles.length;
    const slowMo = pressure >= 18;
    const timeScale = slowMo ? 0.66 : 1;
    const dt = this.running ? rawDt * timeScale : rawDt;

    if (this.running) {
      this.lastStand = this.city.getHealth() <= 24;
      dom.root.classList.toggle("lastStand", this.lastStand);
      this.missiles.update(dt);
      this.defense.update(dt, this.mouseValid ? this.mouseWorld : null, this.lastStand);
      this.effects.update(rawDt);
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - rawDt * 7);
      if (Math.random() < rawDt * (0.35 + pressure * 0.015)) {
        this.flashLight.position.set(rand(-70, 70), rand(30, 65), rand(-70, 70));
        this.flashLight.intensity = rand(0.7, 2.6);
      }

      this.audio.tick(pressure, this.defense.lockProgress >= LOCK_TIME, this.lastStand);
      if (this.city.getHealth() <= 0) this.end();
    } else {
      this.effects.update(rawDt);
    }

    const jammed = this.missiles.jamTimer > 0;
    dom.pressureChip.textContent = jammed
      ? "RADAR JAMMED"
      : this.lastStand
        ? "LAST STAND"
        : slowMo
          ? "SATURATED SKY"
          : pressure > 10
            ? "MULTIPLE IMPACTS"
            : "RADAR CLEAR";
    this.radar.draw(this.mouseValid ? this.mouseWorld : null, jammed, slowMo, this.lastStand);
    this.renderer.render(this.scene, this.camera);
  }
}

new GameEngine();
window.__IDEX_READY__ = true;
