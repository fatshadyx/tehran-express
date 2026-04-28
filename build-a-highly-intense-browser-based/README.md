# Tehran Express

A browser-based Three.js missile defense survival game set in a fictional modern conflict scenario.

## Run Locally

You can open `index.html` directly in a browser.

For the easiest external-browser launch, double-click `Run_Game.bat`.

If your browser blocks local files, start the local static server from this folder:

```powershell
node server.cjs
```

Then open:

```text
http://localhost:8000
```

## Controls

- Mouse: aim targeting reticle
- Left click: snap-lock and launch interceptor at the target under your reticle
- Right click: emergency defense burst
- `F` or Drone Firer button: after a surge, waits 6 seconds, then clears the 6 closest missiles
- Mouse wheel or `+` / `-`: zoom radar view
- `R`: restart after defeat

The game vendors Three.js locally, so it does not need a CDN.

Surge events announce themselves with a short barrage countdown before a heavy missile wave arrives.
