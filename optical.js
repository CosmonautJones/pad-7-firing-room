"use strict";

(function (root) {
  var ready = false;
  var renderer, scene, camera, canvas;
  var earth, atmosphere, atmoInner, clouds, stars;
  var padGroup, tower, rocketGroup, plume, plumeCore, plumeSmoke, engineLight;
  var plumePlanes = [];
  var plumeCores = [], exhaustGroup, vehicleModel;
  var groundSmoke = [];
  var smokeTime = 0;
  var smokeMap, rocketMap, engineHalo, condensation;
  var serviceArms = [], ventPuffs = [], trackingDishes = [];
  var camOff = { x: 0, y: 0, z: 0 };
  var lookOff = { x: 0, y: 0, z: 0 };
  var lastFollowMode = "";
  var lastRenderTime = null;
  var trailLine, orbitLine, debrisGroup;
  var sun, hemi, fill, floodA, floodB;
  var skyMesh;
  var colorMap, cloudMap;
  var camPos = { x: 0, y: 0, z: 0 };
  var camLook = { x: 0, y: 0, z: 0 };
  var camUp = { x: 0, y: 1, z: 0 };
  var camFov = 42;
  var camInited = false;
  var lastStage = -1;
  var lastVehicle = "";
  var reduceMotion = false;
  var scratchDir = null;
  var scratchUp = null;
  var lastUiCam = "";
  var sunDir = null;
  var padLit = true;
  var lastOpts = null;
  var navigation = { active: false, map: false, yaw: 0, pitch: 0, distance: 140, fov: 40 };
  var pointers = new Map();

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

  // Orbit in a local radial frame. World translation is never smoothed, even at 25x.
  function manualView(state, nav) {
    var R = state.planetRadius;
    var center = modelFrame(state).center;
    var look = nav.map ? { x: 0, y: 0, z: 0 } : {
      x: state.x + Math.cos(state.theta) * center,
      y: state.y + Math.sin(state.theta) * center, z: 0,
    };
    var radius = Math.hypot(look.x, look.y);
    var up = nav.map ? { x: 0, y: 1, z: 0 } : { x: look.x / radius, y: look.y / radius, z: 0 };
    var distance = clamp(nav.distance, nav.map ? R * 2.2 : state.stage > 0 ? 32 : 45, nav.map ? R * 8 : state.stage > 0 ? 230 : 320);
    var pitch = clamp(nav.pitch, -1.35, 1.35);
    if (!nav.map) pitch = Math.max(pitch, Math.asin(clamp((R + 6 - radius) / distance, -1, 1)));
    var radial = Math.sin(pitch) * distance;
    var side = Math.sin(nav.yaw) * Math.cos(pitch) * distance;
    return {
      mode: nav.map ? "map" : "manual",
      pos: { x: look.x + up.x * radial + up.y * side, y: look.y + up.y * radial - up.x * side, z: Math.cos(nav.yaw) * Math.cos(pitch) * distance },
      look: look, up: up, fov: nav.fov,
    };
  }

  function signalControls() {
    if (canvas) canvas.dispatchEvent(new Event("opticalchange"));
  }

  function takeCamera() {
    if (!ready || !lastOpts) return false;
    if (navigation.active) return true;
    navigation.map = lastFollowMode === "map";
    navigation.fov = camera.fov;
    var view = manualView(lastOpts.state, navigation);
    var dx = camera.position.x - view.look.x, dy = camera.position.y - view.look.y, dz = camera.position.z;
    var distance = Math.max(1, Math.hypot(dx, dy, dz));
    navigation.yaw = Math.atan2(dx * view.up.y - dy * view.up.x, dz);
    navigation.pitch = Math.asin(clamp((dx * view.up.x + dy * view.up.y) / distance, -1, 1));
    navigation.distance = distance;
    navigation.active = true;
    signalControls();
    return true;
  }

  function orbit(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !takeCamera()) return;
    navigation.yaw = (navigation.yaw - dx) % (Math.PI * 2);
    navigation.pitch = clamp(navigation.pitch + dy, -1.35, 1.35);
  }

  function zoom(factor) {
    if (!Number.isFinite(factor) || factor <= 0 || !takeCamera()) return;
    // Start from the effective distance, so limits never accumulate hidden scroll.
    var view = manualView(lastOpts.state, navigation);
    var span = Math.hypot(view.pos.x-view.look.x, view.pos.y-view.look.y, view.pos.z-view.look.z);
    navigation.distance = span * clamp(factor, 0.25, 4);
    view = manualView(lastOpts.state, navigation);
    navigation.distance = Math.hypot(view.pos.x-view.look.x, view.pos.y-view.look.y, view.pos.z-view.look.z);
  }

  function recenter() {
    navigation.active = false;
    pointers.clear();
    if (canvas) canvas.classList.remove("dragging");
    signalControls();
  }

  function bindCameraInput() {
    canvas.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.classList.add("dragging");
    });
    canvas.addEventListener("pointermove", function (event) {
      var previous = pointers.get(event.pointerId);
      if (!previous) return;
      var before = Array.from(pointers.values());
      var oldSpan = before.length === 2 ? Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y) : 0;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        var scale = Math.PI / Math.max(240, canvas.clientHeight);
        orbit((event.clientX-previous.x)*scale, (event.clientY-previous.y)*scale);
      } else if (pointers.size === 2) {
        var after = Array.from(pointers.values());
        var newSpan = Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);
        if (oldSpan > 4 && newSpan > 4) zoom(oldSpan/newSpan);
      }
    });
    function release(event) {
      pointers.delete(event.pointerId);
      if (!pointers.size) canvas.classList.remove("dragging");
    }
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (name) { canvas.addEventListener(name, release); });
    window.addEventListener("blur", function () { pointers.clear(); canvas.classList.remove("dragging"); });
    canvas.addEventListener("wheel", function (event) {
      if (event.ctrlKey || event.metaKey) return; // Keep browser page zoom available.
      event.preventDefault();
      var units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      zoom(Math.exp(clamp(event.deltaY * units, -180, 180) * 0.002));
    }, { passive: false });
    canvas.addEventListener("dblclick", function () { canvas.dispatchEvent(new Event("opticalrecenter")); });
    canvas.addEventListener("keydown", function (event) {
      var movement = { ArrowLeft: [-0.08,0], ArrowRight: [0.08,0], ArrowUp: [0,0.08], ArrowDown: [0,-0.08] }[event.key];
      if (movement) { orbit(movement[0], movement[1]); event.preventDefault(); event.stopPropagation(); }
    });
  }

  function hasThree() {
    return typeof THREE !== "undefined";
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function lerp3(out, a, b, t) {
    out.x = lerp(a.x, b.x, t);
    out.y = lerp(a.y, b.y, t);
    out.z = lerp(a.z, b.z, t);
    return out;
  }
  function hash(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // The flight plane uses the launch site's radial direction as +Y and east as +X.
  // Rotate geography into that frame without altering the physics coordinates.
  function earthOrientation() {
    var lat = 28.5 * Math.PI / 180, lon = -80.6 * Math.PI / 180;
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(
      -Math.sin(lon), 0, -Math.cos(lon), 0,
      Math.cos(lat)*Math.cos(lon), Math.sin(lat), -Math.cos(lat)*Math.sin(lon), 0,
      Math.sin(lat)*Math.cos(lon), -Math.cos(lat), -Math.sin(lat)*Math.sin(lon), 0,
      0, 0, 0, 1
    ));
  }

  function makeEarthMaps() {
    var surface = document.createElement("canvas");
    surface.width = 4; surface.height = 2;
    var ink = surface.getContext("2d");
    ink.fillStyle = "#12334d"; ink.fillRect(0, 0, 4, 2);
    colorMap = new THREE.CanvasTexture(surface);
    colorMap.colorSpace = THREE.SRGBColorSpace;
    colorMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (root.Pad7EarthImage) {
      var satellite = new Image();
      satellite.onload = function () {
        // GPU texture storage cannot be resized after its first upload.
        var placeholder = colorMap;
        colorMap = new THREE.Texture(satellite);
        colorMap.colorSpace = THREE.SRGBColorSpace;
        colorMap.anisotropy = placeholder.anisotropy;
        colorMap.needsUpdate = true;
        earth.material.map = colorMap;
        placeholder.dispose();
      };
      // A data URI keeps the canvas origin-clean for photography under file://.
      satellite.src = root.Pad7EarthImage;
    }
    var clear = new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
    clear.needsUpdate = true;
    cloudMap = clear;
    if (root.Pad7CloudImage) {
      var weather = new Image();
      weather.onload = function () {
        cloudMap = new THREE.Texture(weather);
        cloudMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        cloudMap.needsUpdate = true;
        clouds.material.alphaMap = cloudMap;
        clear.dispose();
      };
      weather.src = root.Pad7CloudImage;
    }
  }

  function atmoMaterial(inner) {
    return new THREE.ShaderMaterial({
      side: inner ? THREE.FrontSide : THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        sunDir: { value: new THREE.Vector3(1, 0.12, -0.55).normalize() },
        glowColor: { value: new THREE.Color(inner ? 0xa8d8ff : 0x6ec0ff) },
        sunsetColor: { value: new THREE.Color(0xff7a3a) },
        strength: { value: inner ? 0.06 : 0.65 },
        planetRadius: { value: 6371000 },
      },
      vertexShader:
        "#include <common>\n" +
        "#include <logdepthbuf_pars_vertex>\n" +
        "varying vec3 vWorld;\n" +
        "void main(){\n" +
        "  vec4 w = modelMatrix * vec4(position,1.0);\n" +
        "  vWorld = w.xyz;\n" +
        "  gl_Position = projectionMatrix * viewMatrix * w;\n" +
        "  #include <logdepthbuf_vertex>\n" +
        "}",
      fragmentShader:
        "#include <logdepthbuf_pars_fragment>\n" +
        "varying vec3 vWorld;\n" +
        "uniform vec3 sunDir; uniform vec3 glowColor; uniform vec3 sunsetColor; uniform float strength; uniform float planetRadius;\n" +
        "void main(){\n" +
        "  #include <logdepthbuf_fragment>\n" +
        "  vec3 n = normalize(vWorld);\n" +
        "  vec3 view = normalize(cameraPosition - vWorld);\n" +
        "  float rim = pow(1.0 - abs(dot(n, view)), 2.8);\n" +
        "  float sun = dot(n, normalize(sunDir));\n" +
        "  float day = smoothstep(-0.12, 0.28, sun);\n" +
        "  float term = pow(1.0 - abs(sun), 3.4);\n" +
        "  vec3 col = mix(glowColor, sunsetColor, clamp(term * 0.18, 0.0, 0.24));\n" +
        "  float height = max(0.0, length(cross(cameraPosition, normalize(vWorld-cameraPosition))) - planetRadius);\n" +
        "  float a = exp(-height / 13000.0) * (0.18 + 0.82 * day) * strength;\n" +
        "  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));\n" +
        "  #include <tonemapping_fragment>\n" +
        "  #include <colorspace_fragment>\n" +
        "}",
    });
  }

  function skyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color(0x1c2438) },
        horizon: { value: new THREE.Color(0xe39a55) },
        dawn: { value: 1 },
      },
      vertexShader:
        "varying vec3 vDir;\n" +
        "void main(){\n" +
        "  vDir = position;\n" +
        "  vec4 mv = modelViewMatrix * vec4(position,1.0);\n" +
        "  gl_Position = projectionMatrix * mv;\n" +
        "}",
      fragmentShader:
        "varying vec3 vDir; uniform vec3 zenith; uniform vec3 horizon; uniform float dawn;\n" +
        "void main(){\n" +
        "  vec3 n = normalize(vDir);\n" +
        "  float h = smoothstep(-0.045, 0.32, n.y);\n" +
        "  vec3 space = vec3(0.00015,0.00022,0.00045);\n" +
        "  vec3 col = mix(horizon * 1.12, zenith, h);\n" +
        "  vec3 sunD = normalize(vec3(1.0, 0.12, -0.55));\n" +
        "  float sd = max(0.0, dot(n, sunD));\n" +
        "  col += vec3(1.0, 0.66, 0.32) * pow(sd, 240.0) * dawn * 0.65;\n" +
        "  col += vec3(1.0, 0.86, 0.6) * smoothstep(0.99991, 0.99997, sd) * dawn * 2.0;\n" +
        "  col += vec3(0.6, 0.24, 0.08) * pow(sd, 8.0) * dawn;\n" +
        "  col += vec3(1.0, 0.45, 0.12) * pow(sd, 2.5) * dawn * 0.25;\n" +
        "  col = mix(space, col, dawn);\n" +
        "  float az = atan(n.z, n.x);\n" +
        "  float wisps = sin(az * 19.0 + n.y * 85.0 + sin(az * 7.0)) * 0.5 + 0.5;\n" +
        "  float layer = exp(-pow((n.y - 0.07 - sin(az * 3.0) * 0.012) * 50.0, 2.0));\n" +
        "  col = mix(col, vec3(0.31, 0.27, 0.3), layer * smoothstep(0.3, 0.9, wisps) * dawn * 0.3);\n" +
        "  float deck = exp(-pow((n.y - 0.18 - sin(az * 2.1) * 0.02) * 16.0, 2.0));\n" +
        "  float deckBreaks = sin(az * 11.0 + n.y * 40.0) * 0.5 + 0.5;\n" +
        "  col = mix(col, vec3(0.72, 0.4, 0.22), deck * smoothstep(0.2, 0.8, deckBreaks) * dawn * 0.5);\n" +
        "  float horizonBand = exp(-pow(n.y * 48.0, 2.0));\n" +
        "  col += vec3(1.0, 0.62, 0.28) * horizonBand * dawn * 0.85;\n" +
        "  gl_FragColor = vec4(col, 1.0);\n" +
        "  #include <tonemapping_fragment>\n" +
        "  #include <colorspace_fragment>\n" +
        "}",
    });
  }

  function flameCardMaterial(smoke) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 },
        throttle: { value: 1 },
        vacuum: { value: 1 },
        smoke: { value: smoke ? 1 : 0 },
      },
      vertexShader:
        "#include <common>\n" +
        "#include <logdepthbuf_pars_vertex>\n" +
        "uniform float time; uniform float throttle;\n" +
        "varying vec2 vUv;\n" +
        "void main(){\n" +
        "  vUv = uv;\n" +
        "  vec3 p = position;\n" +
        "  float tip = 1.0 - uv.y;\n" +
        "  p.x += sin(time * 21.0 + uv.y * 9.0) * 0.22 * tip * throttle;\n" +
        "  p.y += sin(time * 17.0 + uv.x * 6.0) * 0.12 * tip * throttle;\n" +
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);\n" +
        "  #include <logdepthbuf_vertex>\n" +
        "}",
      fragmentShader:
        "#include <logdepthbuf_pars_fragment>\n" +
        "uniform float time; uniform float throttle; uniform float vacuum; uniform float smoke;\n" +
        "varying vec2 vUv;\n" +
        "float nse(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }\n" +
        "void main(){\n" +
        "  #include <logdepthbuf_fragment>\n" +
        "  float x = abs(vUv.x - 0.5) * 2.0;\n" +
        "  float y = vUv.y;\n" +
        "  float ripple = sin(y * 39.0 + time * 16.0 + sin(y * 17.0 - time * 7.0));\n" +
        "  float width = mix((0.08 + 0.92 * pow(y, 0.65)) * (1.0 + ripple * 0.1 * (1.0-y)), 0.95 - 0.7 * y, smoke);\n" +
        "  float shape = 1.0 - smoothstep(width * 0.15, width, x);\n" +
        "  shape *= pow(max(y, 0.0), 0.32);\n" +
        "  float n = 0.5 + 0.25 * sin(y * 32.0 + time * 19.0 + sin(vUv.x * 13.0 - time * 4.0)) + 0.25 * sin(y * 57.0 + time * 27.0);\n" +
        "  shape *= 0.78 + 0.22 * n;\n" +
        "  shape *= mix(1.0, sin(y * 3.14159), smoke);\n" +
        "  vec3 hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.96, 0.82), pow(y, 1.5) * (1.0 - x * 0.7));\n" +
        "  hot = mix(hot, vec3(0.45, 0.62, 1.0), clamp((vacuum - 1.0) * 1.15, 0.0, 0.9) * (1.0 - y));\n" +
        "  float diamonds = pow(max(0.0, cos((1.0-y) * 42.0)), 12.0) * exp(-x*x*50.0) * y * (1.0-y);\n" +
        "  hot += vec3(0.7, 0.85, 1.0) * diamonds * 2.5;\n" +
        "  vec3 sm = vec3(0.55, 0.52, 0.48);\n" +
        "  vec3 col = mix(hot, sm, smoke);\n" +
        "  float a = shape * throttle * (smoke > 0.5 ? 0.22 : 1.0);\n" +
        "  gl_FragColor = vec4(col * (1.0 + (1.0 - smoke) * (0.35 + y * 0.5)), clamp(a, 0.0, 1.0));\n" +
        "  #include <tonemapping_fragment>\n" +
        "  #include <colorspace_fragment>\n" +
        "}",
    });
  }

  function markShadow(mesh, cast, receive) {
    mesh.castShadow = !!cast;
    mesh.receiveShadow = !!receive;
    return mesh;
  }

  function makeLivery() {
    var sheet = document.createElement("canvas");
    sheet.width = 512; sheet.height = 1024;
    var ink = sheet.getContext("2d");
    ink.fillStyle = "#ede6d8"; ink.fillRect(0, 0, 512, 1024);
    // Roll markings, access seams and stencilled serials are baked once.
    for (var j = 0; j < 16; j += 1) {
      ink.fillStyle = j % 2 ? "#242521" : "#ede6d8";
      ink.fillRect(j * 32, 65, 32, 82);
    }
    ink.fillStyle = "#363932";
    ink.fillRect(0, 875, 512, 22);
    ink.fillStyle = "#a8a59a";
    [200, 700, 930].forEach(function (y) { ink.fillRect(0, y, 512, 2); });
    ink.font = "bold 27px monospace"; ink.textAlign = "center";
    ink.fillStyle = "#292b28";
    [128, 384].forEach(function (x) {
      "PAD-7".split("").forEach(function (letter, i) { ink.fillText(letter, x, 350 + i * 48); });
      ink.font = "16px monospace"; ink.fillText("ER / 007", x, 795); ink.font = "bold 27px monospace";
    });
    rocketMap = new THREE.CanvasTexture(sheet);
    rocketMap.colorSpace = THREE.SRGBColorSpace;
    rocketMap.anisotropy = 8;
  }

  function makePad(R) {
    padGroup = new THREE.Group();
    var conc = new THREE.MeshStandardMaterial({ color: 0x6a6558, roughness: 0.9, metalness: 0.04 });
    var rust = new THREE.MeshStandardMaterial({ color: 0x3f3428, roughness: 0.62, metalness: 0.28 });
    var steel = new THREE.MeshStandardMaterial({ color: 0x3a3328, roughness: 0.42, metalness: 0.66 });
    var water = new THREE.MeshStandardMaterial({ color: 0x0c242c, roughness: 0.16, metalness: 0.38 });
    var grass = new THREE.MeshStandardMaterial({ color: 0x2a3828, roughness: 0.96, metalness: 0.0 });
    var brass = new THREE.MeshStandardMaterial({ color: 0xc4a15a, roughness: 0.32, metalness: 0.72 });
    var lampM = new THREE.MeshStandardMaterial({ color: 0xffd6a0, emissive: 0xffc078, emissiveIntensity: 0.7, roughness: 0.45 });
    var sand = new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 0.95, metalness: 0.0 });

    var marsh = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(2200, 2200, 1.0, 64), new THREE.MeshStandardMaterial({ color: 0x3a4630, roughness: 0.97, metalness: 0.0 })), false, true);
    marsh.position.y = -2.0;
    padGroup.add(marsh);
    var apron = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(260, 260, 1.2, 48), sand), false, true);
    apron.position.y = -0.8;
    padGroup.add(apron);

    var deck = markShadow(new THREE.Mesh(new THREE.BoxGeometry(96, 2.4, 74), conc), true, true);
    deck.position.set(8, 1.2, 0);
    padGroup.add(deck);

    var trench = markShadow(new THREE.Mesh(new THREE.BoxGeometry(30, 4.2, 20), rust), false, true);
    trench.position.set(0, -0.6, 0);
    padGroup.add(trench);

    var flame = markShadow(new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.8, metalness: 0.2 })), false, true);
    flame.position.set(0, 0.4, 0);
    padGroup.add(flame);

    var lagoon = markShadow(new THREE.Mesh(new THREE.BoxGeometry(560, 1, 200), water), false, true);
    lagoon.position.set(190, -1.4, -48);
    padGroup.add(lagoon);
    var foam = new THREE.Mesh(
      new THREE.BoxGeometry(548, 0.12, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xd5e4dc, roughness: 0.72, metalness: 0.04 })
    );
    foam.position.set(190, -0.72, 50.6);
    padGroup.add(foam);
    var channel = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.08, 70),
      new THREE.MeshStandardMaterial({ color: 0x16343c, roughness: 0.2, metalness: 0.45 })
    );
    channel.position.set(70, -0.55, 18);
    padGroup.add(channel);

    var bank = markShadow(new THREE.Mesh(new THREE.BoxGeometry(160, 1.6, 200), grass), false, true);
    bank.position.set(-96, -0.5, -24);
    padGroup.add(bank);

    var crawler = markShadow(new THREE.Mesh(new THREE.BoxGeometry(420, 0.8, 28), conc), false, true);
    crawler.position.set(180, 0.2, 36);
    padGroup.add(crawler);

    var bunker = markShadow(new THREE.Mesh(new THREE.BoxGeometry(28, 8, 18), conc), true, true);
    bunker.position.set(-118, 4, 42);
    padGroup.add(bunker);
    var slit = new THREE.Mesh(new THREE.BoxGeometry(20, 1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.4, metalness: 0.2 }));
    slit.position.set(-118, 6.6, 51.2);
    padGroup.add(slit);

    function mast(x, z, h) {
      var m = markShadow(new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 1.5), steel), true, false);
      m.position.set(x, h / 2, z);
      padGroup.add(m);
      var cap = markShadow(new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 3.4), brass), true, false);
      cap.position.set(x, h + 0.4, z);
      padGroup.add(cap);
    }
    mast(-72, 10, 56);
    mast(62, -14, 64);
    mast(-48, -52, 48);

    function floodHead(x, z, h) {
      var pole = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, h, 8), steel), true, false);
      pole.position.set(x, h / 2, z);
      padGroup.add(pole);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), lampM);
      head.position.set(x, h + 0.2, z);
      padGroup.add(head);
    }
    floodHead(-110, 155, 22);
    floodHead(118, 148, 24);
    floodHead(-96, -140, 20);

    for (var p = 0; p < 4; p += 1) {
      var a = (p / 4) * Math.PI * 2 + 0.4;
      var post = markShadow(new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.6, 2.2), rust), true, true);
      post.position.set(Math.cos(a) * 6.5, 2.4, Math.sin(a) * 6.5);
      padGroup.add(post);
    }

    tower = new THREE.Group();
    var pole = markShadow(new THREE.Mesh(new THREE.BoxGeometry(2.4, 96, 2.4), steel), true, true);
    pole.position.y = 48;
    tower.add(pole);
    var pole2 = markShadow(new THREE.Mesh(new THREE.BoxGeometry(2.0, 96, 2.0), steel), true, true);
    pole2.position.set(6, 48, 6);
    tower.add(pole2);
    var heights = [90, 72, 54, 36, 18];
    var lens = [30, 22, 18, 14, 10];
    for (var t = 0; t < heights.length; t += 1) {
      var arm = markShadow(new THREE.Mesh(new THREE.BoxGeometry(lens[t], 1.5, 1.5), steel), true, false);
      arm.position.set(lens[t] * 0.32, heights[t], 0);
      tower.add(arm);
      var deckT = markShadow(new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 7), rust), true, true);
      deckT.position.set(3.2, heights[t] - 1.2, 0);
      tower.add(deckT);
    }
    var cross = markShadow(new THREE.Mesh(new THREE.BoxGeometry(1.1, 88, 1.1), steel), true, false);
    cross.position.set(3, 46, 3);
    cross.rotation.z = 0.12;
    tower.add(cross);
    // Open lattice and access rails give the gantry a readable industrial scale.
    function brace(a, b, width, material, parent) {
      var from = new THREE.Vector3(a[0], a[1], a[2]);
      var to = new THREE.Vector3(b[0], b[1], b[2]);
      var delta = to.clone().sub(from);
      var beam = new THREE.Mesh(new THREE.BoxGeometry(width, delta.length(), width), material);
      beam.position.copy(from).add(to).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      parent.add(beam);
    }
    for (var level = 0; level < 8; level += 1) {
      var bottom = level * 12;
      brace([0, bottom, 0], [6, bottom + 12, 6], 0.5, steel, tower);
      brace([6, bottom, 6], [0, bottom + 12, 0], 0.5, steel, tower);
      brace([0, bottom + 12, 0], [6, bottom + 12, 6], 0.6, rust, tower);
    }
    heights.forEach(function (height) {
      brace([-0.8, height + 1.6, 3.5], [7, height + 1.6, 3.5], 0.15, brass, tower);
      brace([-0.8, height, 3.5], [-0.8, height + 1.6, 3.5], 0.15, brass, tower);
      brace([7, height, 3.5], [7, height + 1.6, 3.5], 0.15, brass, tower);
    });
    tower.position.set(14, 0, 6);
    padGroup.add(tower);

    var paint = new THREE.MeshStandardMaterial({ color: 0xb6a472, roughness: 0.95 });
    for (var mark = 0; mark < 12; mark += 1) {
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 6), paint);
      stripe.position.set(-38 + mark * 7, 2.43, 29);
      stripe.rotation.y = -0.5;
      padGroup.add(stripe);
    }
    // Distant tanks and service pipework, kept outside the launch silhouette.
    for (var tank = 0; tank < 3; tank += 1) {
      var vessel = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 12), new THREE.MeshStandardMaterial({ color: 0xb9b7a8, roughness: 0.58, metalness: 0.15 }));
      vessel.position.set(-125 - tank * 24, 12, -75);
      padGroup.add(vessel);
      for (var leg = -1; leg <= 1; leg += 2) brace([vessel.position.x + leg * 5, 0, -75], [vessel.position.x + leg * 5, 10, -75], 1.1, steel, padGroup);
    }
    brace([-174, 2, -64], [-62, 2, -64], 1.4, rust, padGroup);
    brace([-62, 2, -64], [-62, 2, 10], 1.4, rust, padGroup);

    floodA = new THREE.SpotLight(0xffc888, 2.1, 340, 0.52, 0.55, 1.35);
    floodA.position.set(-110, 24, 155);
    floodA.target.position.set(0, 18, 0);
    padGroup.add(floodA);
    padGroup.add(floodA.target);
    floodB = new THREE.SpotLight(0xffd0a0, 1.6, 300, 0.48, 0.6, 1.4);
    floodB.position.set(118, 26, 148);
    floodB.target.position.set(4, 16, 0);
    padGroup.add(floodB);
    padGroup.add(floodB.target);

    // A small fixed pool of soft billboards rolls away from the flame trench.
    var smokeCanvas = document.createElement("canvas");
    smokeCanvas.width = smokeCanvas.height = 128;
    var smokeCtx = smokeCanvas.getContext("2d");
    for (var lobe = 0; lobe < 18; lobe += 1) {
      var angle = hash(lobe + 70) * Math.PI * 2;
      var distance = hash(lobe + 90) * 31;
      var px = 64 + Math.cos(angle) * distance, py = 64 + Math.sin(angle) * distance;
      var gradient = smokeCtx.createRadialGradient(px - 5, py - 8, 0, px, py, 26 + hash(lobe) * 9);
      gradient.addColorStop(0, "rgba(218,213,197,0.5)");
      gradient.addColorStop(0.5, "rgba(158,156,145,0.25)");
      gradient.addColorStop(1, "rgba(110,110,104,0)");
      smokeCtx.fillStyle = gradient;
      smokeCtx.fillRect(0, 0, 128, 128);
    }
    smokeMap = new THREE.CanvasTexture(smokeCanvas);
    smokeMap.colorSpace = THREE.SRGBColorSpace;
    for (var puff = 0; puff < 32; puff += 1) {
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      padGroup.add(sprite);
      groundSmoke.push(sprite);
    }
    // Service bridges connect the gantry to the tank collars and swing clear at commit.
    for (var armIndex = 0; armIndex < 2; armIndex += 1) {
      var bridge = new THREE.Group();
      bridge.name = "service-arm";
      bridge.position.set(0, 28 + armIndex * 18, -6);
      var support = new THREE.Group();
      brace([0, 0, 0], [0, 0, -6], 0.65, steel, support);
      brace([0, -3, 0], [0, 0, -6], 0.2, steel, support);
      tower.add(support);
      bridge.userData.support = support;
      var bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.35, 1.5), steel);
      bridgeDeck.position.x = -6.25;
      bridge.add(bridgeDeck);
      brace([-0.2, 1.2, -0.7], [-12.5, 1.2, -0.7], 0.09, brass, bridge);
      brace([-0.2, 1.2, 0.7], [-12.5, 1.2, 0.7], 0.09, brass, bridge);
      for (var postIndex = 0; postIndex < 7; postIndex += 1) {
        var postX = -postIndex * 2;
        brace([postX, 0, -0.7], [postX, 1.2, -0.7], 0.08, steel, bridge);
        brace([postX, 0, 0.7], [postX, 1.2, 0.7], 0.08, steel, bridge);
      }
      var coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.6, 16), brass);
      coupling.rotation.z = Math.PI / 2;
      coupling.position.set(-12.2, -0.7, 0);
      bridge.add(coupling);
      tower.add(bridge);
      serviceArms.push(bridge);
    }
    // Two tracking stations provide a familiar, human-sized reference on the range.
    for (var dishIndex = 0; dishIndex < 2; dishIndex += 1) {
      var station = new THREE.Group();
      station.position.set(dishIndex ? 82 : -76, 0, dishIndex ? -90 : -48);
      var pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.3, 5, 24), conc);
      pedestal.position.y = 2.5;
      station.add(pedestal);
      var mount = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 2.3, 16), steel);
      mount.position.y = 6;
      station.add(mount);
      var head = new THREE.Group();
      head.position.y = 7;
      station.add(head);
      var dishProfile = [];
      for (var sample = 0; sample <= 20; sample += 1) {
        var radius = sample * 0.26;
        dishProfile.push(new THREE.Vector2(radius, radius * radius * 0.07));
      }
      var dish = new THREE.Mesh(
        new THREE.LatheGeometry(dishProfile, 48),
        new THREE.MeshStandardMaterial({ color: 0xd3d8d3, roughness: 0.44, metalness: 0.25, side: THREE.DoubleSide })
      );
      head.add(dish);
      for (var strut = 0; strut < 3; strut += 1) {
        var angle = strut * Math.PI * 2 / 3;
        brace([Math.cos(angle) * 4.8, 1.6, Math.sin(angle) * 4.8], [0, 4, 0], 0.07, steel, head);
      }
      var feed = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.28, 0.9, 12), brass);
      feed.position.y = 4;
      head.add(feed);
      padGroup.add(station);
      trackingDishes.push(head);
    }
    // Parked support vehicle: wheelbase, cab, glazing and cylindrical service tank.
    var truck = new THREE.Group();
    truck.position.set(-91, 0, 38);
    truck.rotation.y = 0.3;
    var chassis = new THREE.Mesh(new THREE.BoxGeometry(8, 0.55, 2.8), steel);
    chassis.position.y = 1.1;
    truck.add(chassis);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.25, 2.6), new THREE.MeshStandardMaterial({ color: 0xa09d7a, roughness: 0.7 }));
    cab.position.set(3, 2.2, 0);
    truck.add(cab);
    var glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.85, 2.15), new THREE.MeshStandardMaterial({ color: 0x16262a, roughness: 0.28, metalness: 0.35 }));
    glass.position.set(4.06, 2.65, 0);
    truck.add(glass);
    var tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5.2, 32), new THREE.MeshStandardMaterial({ color: 0xc9cbc2, roughness: 0.38, metalness: 0.5 }));
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-1.1, 2.4, 0);
    truck.add(tank);
    for (var axle = 0; axle < 3; axle += 1) {
      for (var side = -1; side <= 1; side += 2) {
        var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x181b1b, roughness: 0.95 }));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(axle === 0 ? 2.9 : -1.4 - (axle - 1) * 1.8, 0.7, side * 1.45);
        truck.add(wheel);
      }
    }
    padGroup.add(truck);
    for (var vent = 0; vent < 12; vent += 1) {
      var ventPuff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, color: 0xdce9e6, transparent: true, depthWrite: false, opacity: 0 }));
      ventPuff.name = "tank-vent";
      padGroup.add(ventPuff);
      ventPuffs.push(ventPuff);
    }

    padGroup.position.set(0, R, 0);
    scene.add(padGroup);
  }

  function clearGroup(g) {
    var geometries = new Set(), materials = new Set();
    g.traverse(function (ch) {
      if (ch.geometry) geometries.add(ch.geometry);
      if (ch.material) materials.add(ch.material);
    });
    while (g.children.length) {
      g.remove(g.children[0]);
    }
    geometries.forEach(function (geometry) { geometry.dispose(); });
    materials.forEach(function (material) { material.dispose(); });
    plume = null;
    plumeCore = null;
    plumeSmoke = null;
    plumePlanes = [];
  }

  function modelProfile(vehicle) {
    var name = (vehicle && vehicle.name || "").toLowerCase();
    if (name.indexOf("sparrow") >= 0) return {id:"sparrow",radius:0.62,booster:18.5,upper:0,nose:6.4,bell:1.4,scale:0.6,fin:1.5};
    if (name.indexOf("heavy") >= 0) return {id:"heavy",radius:2.65,booster:31,upper:15,nose:6.5,bell:2.6,scale:1.14,fin:2.3};
    return {id:"kestrel",radius:1.35,booster:29,upper:12,nose:5.8,bell:2.2,scale:1,fin:2.0};
  }

  function modelFrame(state) {
    var p=modelProfile(state.vehicle), count=state.vehicle?state.vehicle.stages.length:2;
    var bottom=-12.8, activeBottom=bottom, top=bottom+p.bell+p.booster;
    for(var stage=1;stage<count;stage++) {
      if(stage===state.stage)activeBottom=top+0.35;
      top+=3.15+(p.upper||10);
    }
    top+=p.nose;
    return {center:16+(activeBottom+top)*0.5,scale:Math.max(p.scale,(top-bottom)/54.15)};
  }

  function makeVehicleModel(vehicle) {
    var p=modelProfile(vehicle), group=new THREE.Group(), stages=[];
    group.name="vehicle-assembly";
    var count=(vehicle.stages || [{}]).length;
    var base=-12.8, top=base+p.bell+p.booster;
    for(var index=0;index<count;index++) {
      var upper=index>0, final=index===count-1;
      var rootStage=new THREE.Group(); rootStage.name="stage-"+index;
      rootStage.userData.stage=index;
      group.add(rootStage); stages.push(rootStage);
      var r=p.radius*Math.pow(p.id==="heavy"?0.88:0.76,index);
      var nozzleY=upper?top+0.35:base, bellH=upper?2.8:p.bell;
      var floor=nozzleY+bellH, roof=upper?floor+(p.upper||10):top;
      var paint=new THREE.MeshStandardMaterial({color:0xe9e8df,map:rocketMap||null,roughness:0.42,metalness:0.16});
      var white=new THREE.MeshStandardMaterial({color:0xe9e8df,roughness:0.4,metalness:0.18});
      var graphite=new THREE.MeshStandardMaterial({color:0x232a2c,roughness:0.48,metalness:0.4});
      var alloy=new THREE.MeshStandardMaterial({color:0x9aabb0,roughness:0.32,metalness:0.72});
      var heat=new THREE.MeshStandardMaterial({color:0x5c5146,roughness:0.42,metalness:0.7,side:THREE.DoubleSide});
      var accent=new THREE.MeshStandardMaterial({color:p.id==="sparrow"?0xa44a23:0x963a2e,roughness:0.48,metalness:0.12});
      function add(geometry,material,name) {var mesh=markShadow(new THREE.Mesh(geometry,material),true,true);mesh.name=name||"";rootStage.add(mesh);return mesh;}
      function turned(points,material,name) {return add(new THREE.LatheGeometry(points.map(function(v){return new THREE.Vector2(v[0],v[1]);}),64),material,name);}
      function ring(y,radius,width,material) {
        var m=add(new THREE.TorusGeometry(radius,width,8,64),material,"body-joint");m.rotation.x=Math.PI/2;m.position.y=y;return m;
      }
      // Tangent shoulders, closed pressure vessel, and thin structural joints.
      turned([[0,floor],[r*0.83,floor],[r*0.98,floor+0.22],[r,floor+0.65],[r,roof-0.65],[r*0.98,roof-0.22],[r*0.83,roof],[0,roof]],paint,"pressure-vessel");
      [floor+0.7,floor+(roof-floor)*0.34,floor+(roof-floor)*0.7,roof-0.65].forEach(function(y){ring(y,r+0.014,0.028,alloy);});
      for(var roll=0;roll<8;roll++) {
        var marking=add(new THREE.CylinderGeometry(r+0.012,r+0.012,upper?1.4:2.1,8,1,true,roll*Math.PI/4,Math.PI/8),graphite,"roll-marking");
        marking.position.y=roof-2.1;
      }
      var cable=add(new THREE.CylinderGeometry(r*0.045,r*0.045,(roof-floor)*0.9,10),white,"cable-raceway");
      cable.position.set(r*0.707,(floor+roof)*0.5,r*0.707);
      // Flush access covers and their fasteners are attached to the vessel surface.
      for(var panel=0;panel<3;panel++) {
        var cover=add(new THREE.BoxGeometry(r*0.42,r*0.65,0.06),alloy,"access-panel");
        cover.position.set(0,floor+2+panel*(roof-floor)*0.24,r-0.005);
      }
      var engines=!upper&&p.id==="heavy"?5:1;
      var exitR=engines===5?r*0.30:r*(upper?0.91:0.76);
      var nozzles=[];
      for(var engine=0;engine<engines;engine++) {
        var angle=(engine-1)*Math.PI/2;
        var nx=engine===0?0:Math.cos(angle)*r*0.66, nz=engine===0?0:Math.sin(angle)*r*0.66;
        var bell=turned([[exitR,nozzleY],[exitR*0.91,nozzleY+bellH*0.2],[exitR*0.66,nozzleY+bellH*0.58],[exitR*0.35,nozzleY+bellH*0.88],[exitR*0.32,nozzleY+bellH]],heat,"engine-bell");
        bell.position.set(nx,0,nz);
        var lip=ring(nozzleY,exitR,0.045,alloy); lip.position.x=nx;lip.position.z=nz;
        for(var rib=0;rib<4;rib++) {
          var y=nozzleY+bellH*(0.22+rib*0.16), rad=exitR*(0.9-rib*0.17);
          var cooling=ring(y,rad,0.018,alloy);cooling.position.x=nx;cooling.position.z=nz;
        }
        nozzles.push({x:nx,y:nozzleY,z:nz,radius:exitR});
      }
      rootStage.userData.nozzles=nozzles;
      rootStage.userData.radius=r;
      rootStage.userData.center=(nozzleY+(final?roof+p.nose:roof+3.15))*0.5;
      if(!upper) {
        // Root edges sit inside the hull; each fin is a swept airfoil, not a floating box.
        var finShape=new THREE.Shape();
        finShape.moveTo(r-0.12,floor+0.15);
        finShape.lineTo(r+p.fin,floor-0.1);
        finShape.lineTo(r+p.fin*0.82,floor+1.55);
        finShape.lineTo(r-0.12,floor+(p.id==="sparrow"?4.3:5.7));finShape.closePath();
        var finGeometry=new THREE.ExtrudeGeometry(finShape,{depth:0.095,bevelEnabled:true,bevelThickness:0.025,bevelSize:0.035,bevelSegments:1,steps:1});
        finGeometry.translate(0,0,-0.0475);
        for(var f=0;f<4;f++) {var fin=add(finGeometry,graphite,"swept-fin");fin.rotation.y=f*Math.PI/2;fin.userData.rootRadius=r-0.12;fin.userData.hullRadius=r;}
      }
      if(!final) {
        // Open interstage shell conceals the upper engine until the booster departs.
        var shell=add(new THREE.CylinderGeometry(r*(p.id==="heavy"?0.88:0.76),r,3.15,64,1,true),graphite,"interstage");
        shell.material.side=THREE.DoubleSide;shell.position.y=roof+1.575;
        ring(roof+3.15,r*(p.id==="heavy"?0.88:0.76),0.055,alloy);
        for(var rib=0;rib<20;rib++) {
          var a=rib*Math.PI/10, rail=add(new THREE.CylinderGeometry(0.025,0.025,2.55,6),alloy,"interstage-rib");
          rail.position.set(Math.cos(a)*r*0.88,roof+1.5,Math.sin(a)*r*0.88);
        }
      } else {
        var fairing=[];
        for(var n=0;n<=32;n++) {var t=n/32;fairing.push([r*Math.sqrt(Math.max(0,1-t*t)),roof+t*p.nose]);}
        turned(fairing,white,"ogive-fairing");
        ring(roof,r,0.045,alloy);
        var cap=[];for(var n=28;n<=32;n++){var t=n/32;cap.push([r*Math.sqrt(Math.max(0,1-t*t))+0.002,roof+t*p.nose]);}
        turned(cap,accent,"nose-cap");
      }
      top=roof;
    }
    return {group:group,stages:stages,profile:p};
  }

  function buildRocket(vehicle, stage) {
    // Reunite the models before disposal so shared resources are released once.
    if(vehicleModel) vehicleModel.stages.forEach(function(part){rocketGroup.add(part);});
    clearGroup(rocketGroup);
    exhaustGroup = null;
    if(!debrisGroup) debrisGroup=new THREE.Group();
    clearGroup(debrisGroup);
    vehicleModel=makeVehicleModel(vehicle);
    rocketGroup.add(vehicleModel.group);
    var blob=new THREE.Mesh(new THREE.CircleGeometry(vehicleModel.profile.radius*2,32),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.18,depthWrite:false}));
    blob.name="padBlob";blob.rotation.x=-Math.PI/2;blob.position.y=-12.5;rocketGroup.add(blob);
    lastVehicle=vehicle.name;
    setRocketStage(stage);
  }

  function setRocketStage(stage) {
    for(var i=0;i<stage;i++) {
      var dropped=vehicleModel.stages[i];
      if(dropped && dropped.parent!==debrisGroup) debrisGroup.add(dropped);
    }
    if(exhaustGroup) {clearGroup(exhaustGroup);rocketGroup.remove(exhaustGroup);}
    exhaustGroup=new THREE.Group();exhaustGroup.name="engine-exhaust";rocketGroup.add(exhaustGroup);
    plumeCores=[];plumePlanes=[];
    var active=vehicleModel.stages[stage], nozzles=active.userData.nozzles;
    var r=active.userData.radius,h=vehicleModel.profile.booster;
    for(var nozzle=0;nozzle<nozzles.length;nozzle++) {
      var origin=nozzles[nozzle];
      var baseY=origin.y;
      var jetRadius=origin.radius;
    // Local zero is the nozzle: length changes cannot open a gap or enter the bell.
    var coreGeo = new THREE.CylinderGeometry(jetRadius * 0.96, 0.04, 12, 32, 6, false);
    coreGeo.translate(0, -6, 0);
    plumeCore = new THREE.Mesh(
      coreGeo,
      new THREE.MeshBasicMaterial({ color: 0xffedbd, transparent: false, depthWrite: true, toneMapped: false })
    );
    plumeCore.position.set(origin.x,baseY,origin.z);
    exhaustGroup.add(plumeCore);
    plumeCores.push(plumeCore);
    var flameH = 24;
    var flameW = jetRadius * 3.6;
    var flameGeo = new THREE.PlaneGeometry(flameW, flameH, 1, 24);
    flameGeo.translate(0, -flameH / 2, 0);
    var i;
    for (i = 0; i < 3; i += 1) {
      var fm = flameCardMaterial(false);
      var card = new THREE.Mesh(flameGeo, fm);
      card.position.set(origin.x,baseY,origin.z);
      card.rotation.y = (i / 3) * Math.PI;
      exhaustGroup.add(card);
      plumePlanes.push(card);
    }
    }
    plumeCore=plumeCores[0];
    var baseY=nozzles[0].y;
    plume = plumePlanes[0];
    var smokeGeo = new THREE.PlaneGeometry(16, 32, 1, 16);
    smokeGeo.translate(0, -16, 0);
    plumeSmoke = new THREE.Group();
    plumeSmoke.position.y = baseY;
    for (i = 0; i < 2; i += 1) {
      var sm = new THREE.Mesh(smokeGeo, flameCardMaterial(true));
      sm.position.y = -8;
      sm.rotation.y = i * Math.PI * 0.5;
      plumeSmoke.add(sm);
    }
    exhaustGroup.add(plumeSmoke);
    engineHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap || null, color: 0xffad4b, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    engineHalo.position.y = baseY - 0.4;
    engineHalo.scale.set(8, 8, 1);
    exhaustGroup.add(engineHalo);
    condensation = new THREE.Group();
    condensation.position.y = active.userData.center;
    for (var vaporIndex = 0; vaporIndex < 10; vaporIndex += 1) {
      var vaporPuff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap || null, color: 0xe7efef, transparent: true, opacity: 0, depthWrite: false }));
      var vaporAngle = vaporIndex / 10 * Math.PI * 2;
      vaporPuff.position.set(Math.cos(vaporAngle) * r * 1.3, -hash(vaporIndex) * 2, Math.sin(vaporAngle) * r * 1.3);
      vaporPuff.scale.set(4.8, 3.5, 1);
      vaporPuff.material.rotation = vaporAngle;
      condensation.add(vaporPuff);
    }
    exhaustGroup.add(condensation);
    lastStage = stage;
  }

  function makeStars() {
    var n = 1800;
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i += 1) {
      var u = hash(i + 1);
      var v = hash(i + 19);
      var th = u * Math.PI * 2;
      var ph = Math.acos(2 * v - 1);
      var rr = 2e8; // Beyond Earth even at the widest MAP zoom.
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rr * Math.cos(ph);
      pos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8e0c8, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.48 }));
    scene.add(stars);
  }

  function makeLines() {
    var tpos = new Float32Array(1800 * 3);
    var tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(tpos, 3));
    trailLine = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xf4d2a0, transparent: true, opacity: 0.85 }));
    trailLine.frustumCulled = false;
    scene.add(trailLine);
    var opos = new Float32Array(96 * 3);
    var og = new THREE.BufferGeometry();
    og.setAttribute("position", new THREE.BufferAttribute(opos, 3));
    orbitLine = new THREE.LineLoop(og, new THREE.LineDashedMaterial({ color: 0xc4a15a, dashSize: 120000, gapSize: 180000, transparent: true, opacity: 0.55 }));
    orbitLine.frustumCulled = false;
    orbitLine.visible = false;
    scene.add(orbitLine);
    debrisGroup = new THREE.Group();
    scene.add(debrisGroup);
  }

  function makeEnv() {
    try {
      var pmrem = new THREE.PMREMGenerator(renderer);
      var envScene = new THREE.Scene();
      // PMREM needs luminous surfaces; lights alone produce a black environment.
      var shell = new THREE.Mesh(new THREE.SphereGeometry(100,32,16), skyMaterial());
      envScene.add(shell);
      var env = pmrem.fromScene(envScene, 0.02);
      scene.environment = env.texture;
      pmrem.dispose();
      shell.geometry.dispose();
      shell.material.dispose();
    } catch (err) {
      scene.environment = null;
    }
  }

  function desiredCam(state, ui, P) {
    var R = state.planetRadius;
    var alt = P.altitude(state);
    var mode = ui.camera;
    if (mode === "track") mode = "downrange";
    if (mode === "auto") {
      if (ui.phase !== "flight" || alt < 70) mode = "pad";
      else if (ui.missions && ui.missions.orbit) mode = "map";
      else if (alt < 85000) mode = "chase";
      else mode = "limb";
    }
    var framing=modelFrame(state);
    var focusX=state.x+Math.cos(state.theta)*framing.center, focusY=state.y+Math.sin(state.theta)*framing.center;
    var rx = state.x, ry = state.y;
    var rlen = Math.max(Math.hypot(rx, ry), 1);
    var rdx = rx / rlen, rdy = ry / rlen;
    var ex = rdy, ey = -rdx;
    var cth = Math.cos(state.theta), sth = Math.sin(state.theta);
    var spd = Math.hypot(state.vx, state.vy);
    if (mode === "pad") {
      // Side angle keeps the gantry off the stack. Look sits below the chase focus so the deck is in frame.
      return {
        mode: mode,
        pos: { x: rx - 72 * framing.scale, y: focusY - 2 * framing.scale, z: 128 * framing.scale },
        look: { x: focusX + 6 * framing.scale, y: focusY - 10 * framing.scale, z: 0 },
        up: { x: rdx, y: rdy, z: 0 },
        fov: 30,
      };
    }
    if (mode === "tower") {
      return {
        mode: mode,
        pos: { x: 52, y: R + 74, z: 40 },
        look: { x: rx, y: Math.max(ry + 8, R + 20), z: 0 },
        up: { x: rdx, y: rdy, z: 0 },
        fov: 40,
      };
    }
    if (mode === "downrange") {
      var td = alt < 2200 ? 780 : Math.min(22000, 780 + alt * 0.42);
      var ty = Math.sqrt(Math.max(1, R * R - td * td)) + 32;
      return {
        mode: mode,
        pos: { x: td, y: ty, z: 70 },
        look: { x: rx, y: ry, z: 0 },
        up: { x: rdx, y: rdy, z: 0 },
        fov: alt < 3000 ? 26 : 22,
      };
    }
    if (mode === "chase") {
      var span = Math.max(105, Math.min(state.stage > 0 ? 135 : 190, 105 + spd * 0.035));
      return {
        mode: mode,
        pos: {
          x: focusX - cth * span * 0.82 + rdx * span * 0.1,
          y: focusY - sth * span * 0.82 + rdy * span * 0.1,
          z: span * 0.48,
        },
        look: { x: focusX, y: focusY, z: 0 },
        up: { x: rdx, y: rdy, z: 0 },
        fov: 40,
      };
    }
    if (mode === "limb") {
      // Aim along the tangent to Earth, with the vehicle on the horizon.
      var side = state.stage > 0 ? 145 : 185;
      var depression = Math.acos(R / (R + Math.max(0, alt)));
      var radial = Math.sin(depression) * side;
      var lateral = Math.cos(depression) * side;
      return {
        mode: mode,
        pos: { x: focusX + rdx * radial, y: focusY + rdy * radial, z: lateral },
        look: { x: focusX, y: focusY, z: 0 },
        up: { x: rdx, y: rdy, z: 0 },
        fov: 44,
      };
    }
    return {
      mode: "map",
      pos: { x: R * 1.8, y: R * 3.3, z: R * 2.9 },
      look: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: 28,
    };
  }

  function placeSun(R) {
    sunDir.set(1.0, 0.12, -0.55).normalize();
    sun.position.set(sunDir.x * 400, R + sunDir.y * 400, sunDir.z * 400);
    sun.target.position.set(0, R, 0);
    sun.target.updateMatrixWorld();
    var d = 140;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 40;
    sun.shadow.camera.far = 900;
    sun.shadow.camera.updateProjectionMatrix();
  }

  function init(el) {
    if (!hasThree()) return false;
    canvas = el;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        logarithmicDepthBuffer: true,
        powerPreference: "high-performance",
      });
    } catch (err) {
      return false;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x05070c, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.8, 4e8);
    scratchDir = new THREE.Vector3();
    scratchUp = new THREE.Vector3();
    sunDir = new THREE.Vector3(1.0, 0.12, -0.55).normalize();
    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = motionQuery.matches;
    motionQuery.addEventListener("change", function (event) { reduceMotion = event.matches; });

    makeEarthMaps();
    makeLivery();
    var R = 6371000;
    earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 256, 192),
      new THREE.MeshStandardMaterial({
        map: colorMap,
        roughness: 0.88,
        envMapIntensity: 0.12,
        metalness: 0.04,
        dithering: true,
      })
    );
    earth.name = "earth";
    earth.quaternion.copy(earthOrientation());
    earth.receiveShadow = true;
    scene.add(earth);
    atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 48), atmoMaterial(false));
    scene.add(atmosphere);
    atmoInner = new THREE.Mesh(new THREE.SphereGeometry(R * 1.003, 64, 48), atmoMaterial(true));
    scene.add(atmoInner);
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.0012, 192, 128),
      new THREE.MeshLambertMaterial({
        alphaMap: cloudMap,
        color: 0xf1f7ff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    clouds.name = "clouds";
    clouds.quaternion.copy(earth.quaternion);
    scene.add(clouds);
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1.6e6, 24, 16), skyMaterial());
    skyMesh.material.depthTest = false;
    skyMesh.renderOrder = -1000;
    scene.add(skyMesh);

    hemi = new THREE.HemisphereLight(0xffd4b0, 0x0c1c28, 0.48);
    scene.add(hemi);
    fill = new THREE.DirectionalLight(0x8eb4d8, 0.28);
    fill.position.set(-0.6, 0.2, 0.5);
    scene.add(fill);
    sun = new THREE.DirectionalLight(0xffe6c8, 2.35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.8;
    sun.shadow.radius = 2;
    scene.add(sun);
    scene.add(sun.target);
    placeSun(R);
    engineLight = new THREE.PointLight(0xff8a3a, 0, 180, 2);
    scene.add(engineLight);

    makeEnv();
    makePad(R);
    rocketGroup = new THREE.Group();
    scene.add(rocketGroup);
    makeStars();
    makeLines();
    ready = true;
    bindCameraInput();
    return true;
  }

  function resize(w, h) {
    if (!ready) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function reset() {
    recenter();
    lastOpts = null;
    camInited = false;
    lastRenderTime = null;
    smokeTime = 0;
    lastStage = -1;
    lastVehicle = "";
    lastUiCam = "";
    lastFollowMode = "";
    if (trailLine) trailLine.geometry.setDrawRange(0, 0);
  }

  function updateTrail(history) {
    var attr = trailLine.geometry.getAttribute("position");
    var n = Math.min(history.length, 1800);
    for (var i = 0; i < n; i += 1) {
      attr.setXYZ(i, history[i].x, history[i].y, 0);
    }
    attr.needsUpdate = true;
    trailLine.geometry.setDrawRange(0, n);
    trailLine.geometry.computeBoundingSphere();
  }

  function updateOrbit(P, state, mode) {
    if (mode !== "map") {
      orbitLine.visible = false;
      return;
    }
    var pts = P.orbitPoints(state, 96);
    if (pts.length < 8) {
      orbitLine.visible = false;
      return;
    }
    var attr = orbitLine.geometry.getAttribute("position");
    for (var i = 0; i < pts.length; i += 1) attr.setXYZ(i, pts[i].x, pts[i].y, 0);
    attr.needsUpdate = true;
    orbitLine.geometry.setDrawRange(0, pts.length);
    orbitLine.computeLineDistances();
    orbitLine.visible = true;
  }

  function updateDebris(list) {
    for(var i=0;i<debrisGroup.children.length;i++) {
      var mesh=debrisGroup.children[i], d=list && list[mesh.userData.stage];
      mesh.visible=!!d;
      if(!d) continue;
      // The detached hardware follows the physics-owned trajectory and tumble.
      var angle=reduceMotion?d.theta-d.omega*d.age:d.theta;
      mesh.position.set(d.x+Math.cos(angle)*16,d.y+Math.sin(angle)*16,0);
      mesh.quaternion.setFromUnitVectors(scratchUp.set(0,1,0),scratchDir.set(Math.cos(angle),Math.sin(angle),0));
    }
  }

  function driveFlame(mat, throttle, vacuum, now) {
    if (!mat || !mat.uniforms) return;
    mat.uniforms.time.value = reduceMotion ? 0 : now * 0.001;
    mat.uniforms.throttle.value = throttle;
    mat.uniforms.vacuum.value = vacuum;
  }

  function render(opts) {
    if (!ready) return;
    lastOpts = opts;
    var state = opts.state;
    var ui = opts.ui;
    var P = opts.P;
    var vehicle = opts.vehicle;
    var now = opts.now || 0;
    var frameNow = opts.frameNow === undefined ? now : opts.frameNow;
    var frameDt = lastRenderTime === null ? 1 / 60 : Math.max(0, Math.min(0.1, (frameNow - lastRenderTime) / 1000));
    lastRenderTime = frameNow;
    var dt = ui.photo ? 0 : frameDt;
    var ease = 1 - Math.exp(-frameDt * 4.5);
    var R = state.planetRadius;
    var alt = P.altitude(state);
    var dawn = Math.max(0, 1 - alt / 90000);
    atmosphere.material.uniforms.planetRadius.value = R;
    atmoInner.material.uniforms.planetRadius.value = R;

    if (earth.geometry.parameters.radius !== R) {
      earth.geometry.dispose();
      earth.geometry = new THREE.SphereGeometry(R, 256, 192);
      atmosphere.geometry.dispose();
      atmosphere.geometry = new THREE.SphereGeometry(R * 1.012, 64, 48);
      atmoInner.geometry.dispose();
      atmoInner.geometry = new THREE.SphereGeometry(R * 1.003, 64, 48);
      clouds.geometry.dispose();
      clouds.geometry = new THREE.SphereGeometry(R * 1.0012, 192, 128);
      padGroup.position.set(0, R, 0);
      placeSun(R);
    }

    if (vehicle.name !== lastVehicle || state.stage < lastStage) buildRocket(vehicle,state.stage);
    else if (state.stage !== lastStage) setRocketStage(state.stage);

    // Physics tracks a point at the surface. Lift the model so the bell clears the deck.
    rocketGroup.position.set(state.x + Math.cos(state.theta) * 16, state.y + Math.sin(state.theta) * 16, 0);
    scratchDir.set(Math.cos(state.theta), Math.sin(state.theta), 0);
    rocketGroup.quaternion.setFromUnitVectors(scratchUp.set(0, 1, 0), scratchDir);
    rocketGroup.visible = !state.crashed;
    var blob = rocketGroup.getObjectByName("padBlob");
    if (blob) blob.visible = alt < 8 && !state.crashed;

    var thrusting = state.ignited && state.throttle > 0.05 && state.fuelKg[state.stage] > 0 && !state.crashed;
    if (ui.cam && !ui.photo) {
      ui.cam.shake *= 0.88;
      if (thrusting && alt < 4000 && !reduceMotion) ui.cam.shake = Math.max(ui.cam.shake, state.throttle * 0.55);
    }
    var vac = Math.min(1.85, 1 + alt / 70000);
    var flicker = reduceMotion ? 1 : 0.9 + 0.1 * Math.sin(now * 0.037);
    plumeCores.forEach(function(plumeCore) {
      plumeCore.visible = thrusting;
      if (thrusting) {
        var cs = 0.92 + state.throttle * 0.08;
        plumeCore.scale.set(cs, (0.25 + state.throttle * 0.95) * vac * flicker, cs);
        plumeCore.material.color.setRGB(1 - (vac - 1) * 0.24, 0.93, 0.74 + (vac - 1) * 0.3);
      }
    });
    var pi;
    for (pi = 0; pi < plumePlanes.length; pi += 1) {
      var card = plumePlanes[pi];
      card.visible = thrusting;
      if (thrusting) {
        var ps = (0.85 + state.throttle * 0.35) * (0.85 + vac * 0.15);
        card.scale.set(ps, (0.2 + state.throttle * 0.9) * vac * flicker, ps);
        card.rotation.y = ((pi % 3) / 3) * Math.PI + (reduceMotion ? 0 : Math.sin(now * 0.0017) * 0.12);
        driveFlame(card.material, state.throttle * flicker, vac, now);
      }
    }
    if (plumeSmoke) {
      var smokeOn = thrusting && alt < 9000;
      plumeSmoke.visible = smokeOn;
      if (smokeOn) {
        var ss = 1.05 + (1 - alt / 9000) * 1.2 * state.throttle;
        plumeSmoke.scale.set(ss, 0.95 + state.throttle * 0.4, ss);
        for (pi = 0; pi < plumeSmoke.children.length; pi += 1) {
          driveFlame(plumeSmoke.children[pi].material, state.throttle * (1 - alt / 9000), vac, now);
        }
      }
    }
    var groundAmount = thrusting ? Math.max(0, 1 - alt / 650) * state.throttle : 0;
    if (groundAmount > 0) smokeTime += dt;
    for (pi = 0; pi < groundSmoke.length; pi += 1) {
      var puff = groundSmoke[pi];
      var age = reduceMotion ? 0.35 + hash(pi) * 0.55 : (smokeTime * 0.3 + pi / groundSmoke.length) % 1;
      var spread = age * 65;
      puff.visible = groundAmount > 0;
      puff.position.set((pi % 2 ? -1 : 1) * (4 + spread), 4 + age * 13, Math.sin(pi * 2.4) * (5 + spread * 0.35));
      var size = 11 + age * 40;
      puff.scale.set(size, size * 0.85, 1);
      puff.material.rotation = hash(pi + 123) * 6 + (reduceMotion ? 0 : age * (pi % 2 ? 0.4 : -0.4));
      puff.material.opacity = groundAmount * Math.sin(age * Math.PI) * Math.min(1, smokeTime * 1.5) * 0.85;
    }
    engineHalo.visible = thrusting;
    engineHalo.material.opacity = thrusting ? state.throttle * 0.55 * flicker : 0;
    engineHalo.material.color.set(alt > 60000 ? 0x81baff : 0xffad4b);
    var vapor = Math.exp(-Math.pow(((state.mach || 0) - 1.05) / 0.28, 2)) * Math.min(1, (state.q || 0) / 22000);
    condensation.visible = thrusting && vapor > 0.02 && alt < 18000;
    condensation.children.forEach(function (puff) { puff.material.opacity = vapor * 0.2; });
    engineLight.position.copy(rocketGroup.position).addScaledVector(scratchDir, plumeCore.position.y);
    engineLight.position.z += 3;
    engineLight.intensity = thrusting ? 850 * state.throttle * flicker * (alt < 8000 ? 1 : 0.18) : 0;

    var profile=modelProfile(vehicle);
    var tankTop=3.2+profile.bell+profile.booster;
    serviceArms.forEach(function(arm,index){
      arm.scale.x=(14-profile.radius+0.1)/12.5;
      arm.position.y=index?Math.min(tankTop+profile.upper*0.65,modelFrame(state).center*2-4):tankTop-2.5;
      arm.userData.support.position.y=arm.position.y;
      arm.userData.support.visible=index===0 || vehicle.stages.length>1;
      arm.visible=index===0 || vehicle.stages.length>1;
      var angle=ui.phase==="flight"?-Math.PI*0.65:0;
      if(!ui.photo)arm.rotation.y+=(angle-arm.rotation.y)*(reduceMotion?1:ease);
    });
    ventPuffs.forEach(function(puff,index){
      puff.visible=ui.phase==="hold"||ui.phase==="count";
      if(!puff.visible)return;
      var age=reduceMotion?(index+0.5)/12:((now*0.00013+index/12)%1);
      puff.position.set(profile.radius+age*12,tankTop-1+age*4,age*3);
      var size=0.9+age*5;puff.scale.set(size*1.7,size,1);
      puff.material.opacity=Math.sin(age*Math.PI)*0.3;
    });
    trackingDishes.forEach(function(head,index){
      var station=head.parent;
      var direction=new THREE.Vector3(state.x-station.position.x,state.y-R-7,-station.position.z).normalize();
      if(ui.phase!=="flight")direction.set(index?0.3:-0.4,0.7,0.6).normalize();
      if(!ui.photo)head.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction),reduceMotion?1:ease*0.35);
    });
    var retract = (ui.phase === "count" && ui.countT < 3.5) || ui.phase === "flight";
    if (tower && !ui.photo) {
      var wantTower = retract ? 36 : 14;
      tower.position.x += (wantTower - tower.position.x) * (reduceMotion ? 1 : ease);
    }
    padGroup.visible = alt < 25000;
    var floodAmt = (ui.phase === "count" || ui.phase === "hold") ? 2.0 * dawn : 0.28 * dawn;
    if (floodA) floodA.intensity = floodAmt;
    if (floodB) floodB.intensity = floodAmt * 0.75;
    hemi.intensity = 0.22 + dawn * 0.42;
    fill.intensity = 0.38 + dawn * 0.22;
    sun.intensity = 1.15 + dawn * 1.2;
    clouds.quaternion.copy(earth.quaternion);
    if (!reduceMotion) clouds.rotateY((now / 1000) * 0.000015);

    var want = navigation.active ? manualView(state, navigation) : desiredCam(state, ui, P);
    var showAtmo = want.mode === "map" || want.mode === "limb" || alt > 85000;
    atmosphere.visible = showAtmo;
    atmoInner.visible = showAtmo;
    clouds.visible = want.mode === "map" || want.mode === "limb" || alt > 18000;
    skyMesh.material.uniforms.dawn.value = want.mode === "map" ? 0 : dawn;
    skyMesh.material.uniforms.horizon.value.set(dawn > 0.35 ? 0xe8a070 : 0x1a2838);
    skyMesh.material.uniforms.zenith.value.set(dawn > 0.2 ? 0x263a53 : 0x05070c);
    if (stars) stars.visible = dawn < 0.55 || want.mode === "map" || want.mode === "limb";

    var nearPad = padGroup.visible && want.mode !== "map";
    if (nearPad !== padLit) {
      padLit = nearPad;
      sun.castShadow = nearPad;
    }

    var rx = state.x, ry = state.y;
    var lock = want.mode === "chase" || want.mode === "pad" || want.mode === "limb" || want.mode === "manual";
    // Follow modes share rocket-relative offsets, including the AUTO handover.
    var previousLock = lastFollowMode === "chase" || lastFollowMode === "pad" || lastFollowMode === "limb" || lastFollowMode === "manual";
    var snap = !camInited || !(lock && previousLock) && (lastFollowMode !== want.mode || ui.camera !== lastUiCam);
    lastUiCam = ui.camera;
    lastFollowMode = want.mode;
    var follow;
    if (lock) {
      var offP = { x: want.pos.x - rx, y: want.pos.y - ry, z: want.pos.z };
      var offL = { x: want.look.x - rx, y: want.look.y - ry, z: want.look.z };
      follow = snap || reduceMotion || navigation.active ? 1 : ease;
      lerp3(camOff, camOff, offP, follow);
      lerp3(lookOff, lookOff, offL, follow);
      camPos.x = rx + camOff.x;
      camPos.y = ry + camOff.y;
      camPos.z = camOff.z;
      camLook.x = rx + lookOff.x;
      camLook.y = ry + lookOff.y;
      camLook.z = lookOff.z;
    } else {
      follow = ui.phase === "flight" && !reduceMotion && camInited && !snap ? 0.16 : 1;
      if (camInited && !snap) {
        var err = Math.hypot(want.pos.x - camPos.x, want.pos.y - camPos.y, want.pos.z - camPos.z);
        follow = Math.min(1, 0.2 + err / 900);
      }
      lerp3(camPos, camPos, want.pos, follow);
      lerp3(camLook, camLook, want.look, Math.min(1, follow + 0.25));
    }
    lerp3(camUp, camUp, want.up, snap || reduceMotion ? 1 : Math.min(1, follow + 0.08));
    camFov = lerp(camFov, want.fov, snap ? 1 : follow);
    camInited = true;
    if (ui.cam && ui.cam.shake && !reduceMotion && !ui.photo && !navigation.active) {
      var sh = ui.cam.shake;
      camera.position.set(
        camPos.x + Math.sin(now * 0.057) * sh * 0.9,
        camPos.y + Math.sin(now * 0.073) * sh * 0.55,
        camPos.z + Math.sin(now * 0.041) * sh * 0.35
      );
    } else {
      camera.position.set(camPos.x, camPos.y, camPos.z);
    }
    camera.up.set(camUp.x, camUp.y, camUp.z);
    camera.lookAt(camLook.x, camLook.y, camLook.z);
    camera.fov = camFov;
    camera.near = want.mode === "map" ? R * 0.02 : want.mode === "limb" && alt > 40000 ? 12 : 0.6;
    camera.far = want.mode === "map" || want.mode === "limb" || navigation.active ? R * 24 : 9e6;
    camera.updateProjectionMatrix();
    skyMesh.position.copy(camera.position);
    if (stars) stars.position.copy(camera.position);

    updateTrail(ui.history || []);
    trailLine.visible = !ui.photo;
    updateOrbit(P, state, want.mode);
    if (ui.photo) orbitLine.visible = false;
    updateDebris(state.debris);

    renderer.render(scene, camera);
  }

  function photoSize(w, h, limit) {
    var scale = Math.min(3840, limit) / Math.max(w, h, 1);
    return { width: Math.max(1,Math.round(w*scale)), height: Math.max(1,Math.round(h*scale)) };
  }

  root.Pad7Optical = {
    init: init,
    resize: resize,
    render: render,
    reset: reset,
    orbit: orbit,
    zoom: zoom,
    recenter: recenter,
    capturePng: function () {
      if (!ready) throw new Error("Optical renderer is unavailable.");
      var liveSize = renderer.getSize(new THREE.Vector2());
      var liveRatio = renderer.getPixelRatio();
      var gl = renderer.getContext();
      var limit = Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      var size = photoSize(liveSize.x, liveSize.y, limit);
      try {
        // Keep the composition, briefly render a full-resolution photographic plate.
        renderer.setPixelRatio(1);
        renderer.setSize(size.width, size.height, false);
        renderer.render(scene, camera);
        return canvas.toDataURL("image/png");
      } finally {
        // Restore even if readback fails; capture must never degrade live play.
        renderer.setPixelRatio(liveRatio);
        renderer.setSize(liveSize.x, liveSize.y, false);
        renderer.render(scene, camera);
      }
    },
    get manual() { return navigation.active; },
    get ready() {
      return ready;
    },
  };
})(typeof self !== "undefined" ? self : this);
