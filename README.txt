PAD-7 FIRING ROOM
=================
Double-click PAD-7.html, Open PAD-7.bat, or the Desktop shortcut.

This is a dawn blockhouse. Arm the countdown. The window is a live 3D Earth (WebGL). The desk stays paper.

Desks
-----
  RANGE   countdown, pitch program, clock. Staging and circularization automatic.
  PILOT   A/D pitch, W/S throttle, X stage
  PROP    Isp, thrust, wet/dry mass, drag
  STACK   payload, extra stages, planet radius, gravity, atmosphere

Keys
----
  I or Space   arm countdown / commit
  /            abort or hold the count
  R            reset to pad
  W/S          throttle
  A/D          pitch
  X            stage
  G            guidance
  , .          clock rate
  C            view  auto / pad / tower / site / chase / limb / map
  1 2 3 4      RANGE / PILOT / PROP / STACK
  M            mute

On RANGE, Kestrel I can make orbit. Warp the clock after liftoff.

Tests:  node test\physics.test.js
