"use strict";

(function (root) {
  var ready = false;
  var renderer, scene, camera, canvas;
  var earth, atmosphere, atmoInner, clouds, stars;
  var padGroup, tower, rocketGroup, plume, plumeCore, plumeSmoke, engineLight;
  var trailLine, orbitLine, debrisGroup;
  var sun, hemi, fill, floodA, floodB;
  var skyMesh;
  var colorMap, cloudMap, roughMap;
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

  function pointInPoly(x, y, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1];
      var xj = pts[j][0], yj = pts[j][1];
      var hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
      if (hit) inside = !inside;
    }
    return inside;
  }

  var NA = [
    [-0.22, 0.80], [-0.10, 0.88], [0.00, 0.91], [0.055, 0.97], [0.13, 0.94],
    [0.09, 0.88], [0.06, 0.84], [0.08, 0.72], [0.03, 0.58], [-0.04, 0.50],
    [-0.16, 0.46], [-0.30, 0.42], [-0.40, 0.50], [-0.46, 0.62], [-0.38, 0.74], [-0.30, 0.82]
  ];
  var FL = [[0.05, 0.975], [0.14, 0.95], [0.12, 0.89], [0.07, 0.86], [0.04, 0.90], [0.045, 0.95]];
  var SA = [
    [-0.16, 0.36], [-0.06, 0.30], [0.00, 0.16], [-0.04, -0.08], [-0.10, -0.28],
    [-0.18, -0.22], [-0.24, 0.02], [-0.22, 0.22]
  ];
  var AF = [
    [0.16, 0.48], [0.30, 0.44], [0.38, 0.28], [0.36, 0.08], [0.28, -0.12],
    [0.18, -0.20], [0.12, -0.02], [0.12, 0.22], [0.14, 0.40]
  ];
  var EU = [[0.10, 0.64], [0.22, 0.66], [0.28, 0.58], [0.20, 0.52], [0.10, 0.56]];
  var ICE = [[-0.20, 0.96], [-0.08, 0.98], [-0.04, 0.90], [-0.18, 0.90]];
  var ANT = [[-0.40, -0.78], [0.40, -0.78], [0.50, -0.88], [0.18, -0.98], [-0.18, -0.98], [-0.50, -0.88]];
  var SAH = [[0.22, 0.36], [0.34, 0.32], [0.32, 0.18], [0.22, 0.20]];
  var AS = [
    [0.32, 0.58], [0.52, 0.64], [0.72, 0.50], [0.78, 0.32], [0.62, 0.18],
    [0.48, 0.16], [0.36, 0.30], [0.30, 0.48]
  ];
  var AU = [[0.52, -0.18], [0.68, -0.16], [0.72, -0.30], [0.60, -0.42], [0.50, -0.32]];
  var GR = [[-0.12, 0.92], [0.02, 0.96], [0.04, 0.88], [-0.10, 0.86]];
  var IND = [[0.42, 0.22], [0.52, 0.20], [0.50, 0.08], [0.42, 0.10]];

  function landKind(x, y) {
    if (y > 0.992) return "sand";
    if (pointInPoly(x, y, FL)) return "florida";
    if (pointInPoly(x, y, ICE) || pointInPoly(x, y, GR)) return "ice";
    if (pointInPoly(x, y, ANT)) return "ice";
    if (pointInPoly(x, y, SAH)) return "desert";
    if (pointInPoly(x, y, IND)) return "land";
    if (pointInPoly(x, y, NA) || pointInPoly(x, y, SA) || pointInPoly(x, y, AF) || pointInPoly(x, y, EU) || pointInPoly(x, y, AS) || pointInPoly(x, y, AU)) return "land";
    return "ocean";
  }

  function makeEarthMaps() {
    var w = 1536, h = 768;
    var cnv = document.createElement("canvas");
    cnv.width = w; cnv.height = h;
    var ctx = cnv.getContext("2d");
    var img = ctx.createImageData(w, h);
    var d = img.data;
    var rcnv = document.createElement("canvas");
    rcnv.width = w; rcnv.height = h;
    var rctx = rcnv.getContext("2d");
    var rimg = rctx.createImageData(w, h);
    var rd = rimg.data;
    for (var j = 0; j < h; j += 1) {
      var v = j / (h - 1);
      var phi = v * Math.PI;
      var sinp = Math.sin(phi);
      var cy = Math.cos(phi);
      for (var i = 0; i < w; i += 1) {
        var u = i / w;
        var th = u * Math.PI * 2;
        var cx = sinp * Math.cos(th);
        var cz = sinp * Math.sin(th);
        var kind = landKind(cx, cy);
        var n = Math.sin(cx * 18 + cy * 11) * 0.55 + Math.sin(cz * 14 - cy * 9) * 0.45 + Math.sin(cx * 41 + cz * 27) * 0.22;
        var p = (j * w + i) * 4;
        var r, g, b, rough;
        if (kind === "ocean") {
          var deep = 0.55 + 0.45 * Math.max(0, -cy);
          r = 10 + n * 5 + (1 - deep) * 8;
          g = 42 + n * 10 + (1 - deep) * 22;
          b = 72 + n * 8 + deep * 28;
          rough = 52 + n * 6;
        } else if (kind === "sand") {
          r = 142 + n * 10; g = 124 + n * 8; b = 78;
          rough = 210;
        } else if (kind === "florida") {
          r = 68 + n * 10; g = 124 + n * 12; b = 64;
          rough = 168;
        } else if (kind === "desert") {
          r = 186 + n * 14; g = 142 + n * 10; b = 78 + n * 4;
          rough = 200;
        } else if (kind === "ice") {
          r = 228 + n * 8; g = 236; b = 242;
          rough = 52;
        } else {
          var dry = Math.max(0, n);
          r = 52 + n * 12 + dry * 18;
          g = 102 + n * 14 - dry * 8;
          b = 52 + n * 6;
          rough = 186 + n * 10;
        }
        if (cz < -0.2 && kind === "ocean") {
          r *= 0.78; g *= 0.84; b *= 0.9;
        }
        d[p] = Math.max(0, Math.min(255, r));
        d[p + 1] = Math.max(0, Math.min(255, g));
        d[p + 2] = Math.max(0, Math.min(255, b));
        d[p + 3] = 255;
        rd[p] = rd[p + 1] = rd[p + 2] = Math.max(0, Math.min(255, rough));
        rd[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    rctx.putImageData(rimg, 0, 0);
    colorMap = new THREE.CanvasTexture(cnv);
    colorMap.colorSpace = THREE.SRGBColorSpace;
    colorMap.anisotropy = 8;
    roughMap = new THREE.CanvasTexture(rcnv);
    roughMap.anisotropy = 4;

    var c2 = document.createElement("canvas");
    c2.width = 1024; c2.height = 512;
    var ctx2 = c2.getContext("2d");
    ctx2.clearRect(0, 0, 1024, 512);
    for (var k = 0; k < 70; k += 1) {
      var a = 0.05 + hash(k) * 0.16;
      ctx2.fillStyle = "rgba(255,255,255," + a + ")";
      ctx2.beginPath();
      ctx2.ellipse(hash(k + 3) * 1024, 40 + hash(k + 9) * 432, 50 + hash(k + 11) * 120, 7 + hash(k + 17) * 18, hash(k + 21) * 1.3, 0, Math.PI * 2);
      ctx2.fill();
    }
    cloudMap = new THREE.CanvasTexture(c2);
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.anisotropy = 4;
  }

  function atmoMaterial(inner) {
    return new THREE.ShaderMaterial({
      side: inner ? THREE.FrontSide : THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        sunDir: { value: new THREE.Vector3(1, 0.28, 0.42).normalize() },
        glowColor: { value: new THREE.Color(inner ? 0xa8d8ff : 0x6ec0ff) },
        sunsetColor: { value: new THREE.Color(0xff7a3a) },
        strength: { value: inner ? 0.42 : 0.9 },
      },
      vertexShader:
        "varying vec3 vWorld;\n" +
        "void main(){\n" +
        "  vec4 w = modelMatrix * vec4(position,1.0);\n" +
        "  vWorld = w.xyz;\n" +
        "  gl_Position = projectionMatrix * viewMatrix * w;\n" +
        "}",
      fragmentShader:
        "varying vec3 vWorld;\n" +
        "uniform vec3 sunDir; uniform vec3 glowColor; uniform vec3 sunsetColor; uniform float strength;\n" +
        "void main(){\n" +
        "  vec3 n = normalize(vWorld);\n" +
        "  vec3 view = normalize(cameraPosition - vWorld);\n" +
        "  float rim = pow(1.0 - abs(dot(n, view)), 2.8);\n" +
        "  float sun = dot(n, normalize(sunDir));\n" +
        "  float day = smoothstep(-0.12, 0.28, sun);\n" +
        "  float term = pow(1.0 - abs(sun), 3.4);\n" +
        "  vec3 col = mix(glowColor, sunsetColor, clamp(term * 1.2, 0.0, 1.0));\n" +
        "  float a = rim * (0.18 + 0.82 * day) * strength;\n" +
        "  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));\n" +
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
        "  float h = smoothstep(-0.06, 0.50, n.y);\n" +
        "  vec3 space = vec3(0.012,0.016,0.03);\n" +
        "  vec3 col = mix(horizon * 1.12, zenith, h);\n" +
        "  vec3 sunD = normalize(vec3(1.0, 0.2, 0.38));\n" +
        "  float sd = max(0.0, dot(n, sunD));\n" +
        "  col += vec3(1.55, 1.05, 0.55) * pow(sd, 90.0) * dawn * 2.4;\n" +
        "  col += vec3(1.2, 0.58, 0.2) * pow(sd, 8.0) * dawn;\n" +
        "  col += vec3(1.0, 0.45, 0.12) * pow(sd, 2.5) * dawn * 0.25;\n" +
        "  col = mix(space, col, dawn);\n" +
        "  float stars = step(0.9965, fract(sin(dot(n.xy, vec2(12.7, 4.2))) * 43758.5));\n" +
        "  col += vec3(0.75, 0.8, 0.9) * stars * (1.0 - dawn);\n" +
        "  gl_FragColor = vec4(col, 1.0);\n" +
        "}",
    });
  }

  function plumeMaterial(core) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 },
        throttle: { value: 1 },
        vacuum: { value: 1 },
        core: { value: core ? 1 : 0 },
      },
      vertexShader:
        "varying vec2 vUv; varying float vY;\n" +
        "void main(){\n" +
        "  vUv = uv;\n" +
        "  vY = position.y;\n" +
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n" +
        "}",
      fragmentShader:
        "varying vec2 vUv; varying float vY;\n" +
        "uniform float time; uniform float throttle; uniform float vacuum; uniform float core;\n" +
        "float nse(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }\n" +
        "void main(){\n" +
        "  float along = clamp(vUv.y, 0.0, 1.0);\n" +
        "  float flicker = 0.82 + 0.18 * nse(vec2(vUv.x * 18.0 + time * 11.0, along * 7.0 - time * 9.0));\n" +
        "  vec3 hot = mix(vec3(1.0, 0.96, 0.82), vec3(1.0, 0.62, 0.18), along);\n" +
        "  vec3 cool = mix(vec3(1.0, 0.48, 0.1), vec3(0.45, 0.55, 0.95), clamp((vacuum - 1.0) * 0.7, 0.0, 1.0));\n" +
        "  vec3 col = mix(cool, hot, core);\n" +
        "  float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;\n" +
        "  float a = pow(max(0.0, 1.0 - along), 1.05) * pow(max(0.0, edge), 0.45) * throttle * flicker;\n" +
        "  a *= core > 0.5 ? 1.0 : 0.7;\n" +
        "  gl_FragColor = vec4(col * (1.15 + core * 0.85), clamp(a, 0.0, 1.0));\n" +
        "}",
    });
  }

  function markShadow(mesh, cast, receive) {
    mesh.castShadow = !!cast;
    mesh.receiveShadow = !!receive;
    return mesh;
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
    tower.position.set(14, 0, 6);
    padGroup.add(tower);

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

    padGroup.position.set(0, R, 0);
    scene.add(padGroup);
  }

  function clearGroup(g) {
    while (g.children.length) {
      var ch = g.children[0];
      g.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) {
        if (ch.material.dispose) ch.material.dispose();
      }
    }
    plume = null;
    plumeCore = null;
    plumeSmoke = null;
  }

  function buildRocket(vehicle, stage) {
    clearGroup(rocketGroup);
    var stages = vehicle.stages || [];
    var two = stages.length > 1 && stage === 0;
    var cream = new THREE.MeshStandardMaterial({ color: 0xf0e6d4, roughness: 0.38, metalness: 0.12 });
    var cream2 = new THREE.MeshStandardMaterial({ color: 0xd9ccb2, roughness: 0.4, metalness: 0.14 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.48, metalness: 0.22 });
    var red = new THREE.MeshStandardMaterial({ color: 0xa31b12, roughness: 0.32, metalness: 0.08 });
    var band = new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 0.42, metalness: 0.18 });
    var finM = new THREE.MeshStandardMaterial({ color: 0x3a3328, roughness: 0.5, metalness: 0.2 });
    var copper = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.28, metalness: 0.78 });
    var h = two ? 34 : 22;
    var r = two ? 1.7 : 1.15;
    var body = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 24), cream), true, true);
    body.position.y = h * 0.22;
    rocketGroup.add(body);
    var stripe = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.99, 1.1, 24), band), true, false);
    stripe.position.y = h * 0.22 - h * 0.12;
    rocketGroup.add(stripe);
    if (two) {
      var inter = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.92, 2.2, 24), band), true, true);
      inter.position.y = h * 0.22 + h * 0.5 - 1;
      rocketGroup.add(inter);
      var upper = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.7, h * 0.42, 24), cream2), true, true);
      upper.position.y = h * 0.22 + h * 0.5 + h * 0.18;
      rocketGroup.add(upper);
    }
    var nose = markShadow(new THREE.Mesh(new THREE.ConeGeometry(r * (two ? 0.55 : 0.92), two ? 6 : 5.5, 24), red), true, true);
    nose.position.y = two ? h * 0.22 + h * 0.5 + h * 0.42 + 1.2 : h * 0.22 + h * 0.5 + 2.2;
    rocketGroup.add(nose);
    var skirt = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.2, 2.4, 24), dark), true, true);
    skirt.position.y = h * 0.22 - h * 0.5;
    rocketGroup.add(skirt);
    var bell = markShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.85, 3.2, 16, 1, true), copper), true, false);
    bell.position.y = h * 0.22 - h * 0.5 - 2.4;
    rocketGroup.add(bell);
    var blob = new THREE.Mesh(
      new THREE.CircleGeometry(r * 3.4, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = h * 0.22 - h * 0.5 - 1.15;
    blob.name = "padBlob";
    rocketGroup.add(blob);
    for (var f = 0; f < 4; f += 1) {
      var fin = markShadow(new THREE.Mesh(new THREE.BoxGeometry(0.32, 5.5, 2.8), finM), true, false);
      var ang = (f / 4) * Math.PI * 2;
      fin.position.set(Math.cos(ang) * (r + 1.1), h * 0.22 - h * 0.42, Math.sin(ang) * (r + 1.1));
      rocketGroup.add(fin);
    }
    var baseY = h * 0.22 - h * 0.5 - 2.6;
    plumeCore = new THREE.Mesh(new THREE.ConeGeometry(1.05, 14, 12, 1, true), plumeMaterial(true));
    plumeCore.position.y = baseY - 8;
    plumeCore.rotation.x = Math.PI;
    rocketGroup.add(plumeCore);
    plume = new THREE.Mesh(new THREE.ConeGeometry(1.85, 22, 14, 1, true), plumeMaterial(false));
    plume.position.y = baseY - 12;
    plume.rotation.x = Math.PI;
    rocketGroup.add(plume);
    plumeSmoke = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 16, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xb8b0a4,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    plumeSmoke.position.y = baseY - 14;
    plumeSmoke.rotation.x = Math.PI;
    rocketGroup.add(plumeSmoke);
    lastStage = stage;
    lastVehicle = vehicle.name;
  }

  function makeStars() {
    var n = 1800;
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i += 1) {
      var u = hash(i + 1);
      var v = hash(i + 19);
      var th = u * Math.PI * 2;
      var ph = Math.acos(2 * v - 1);
      var rr = 1.35e6;
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rr * Math.cos(ph);
      pos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8e0c8, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0.9 }));
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
      envScene.add(new THREE.HemisphereLight(0xffe2c0, 0x102030, 1.15));
      envScene.add(new THREE.DirectionalLight(0xfff0d8, 0.8));
      var env = pmrem.fromScene(envScene, 0.02);
      scene.environment = env.texture;
      pmrem.dispose();
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
      else if (alt < 110000) mode = "chase";
      else mode = "map";
    }
    var rx = state.x, ry = state.y;
    var rlen = Math.max(Math.hypot(rx, ry), 1);
    var rdx = rx / rlen, rdy = ry / rlen;
    var ex = rdy, ey = -rdx;
    var cth = Math.cos(state.theta), sth = Math.sin(state.theta);
    var spd = Math.hypot(state.vx, state.vy);
    if (mode === "pad") {
      return {
        mode: mode,
        pos: { x: rx - 96, y: ry + 30, z: 142 },
        look: { x: rx + 2, y: ry + 18, z: 0 },
        up: { x: rdx, y: rdy, z: 0 },
        fov: 34,
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
      var span = Math.max(150, 110 + spd * 0.14);
      return {
        mode: mode,
        pos: {
          x: rx - cth * span * 0.82 + rdx * span * 0.1,
          y: ry - sth * span * 0.82 + rdy * span * 0.1,
          z: span * 0.48,
        },
        look: { x: rx + cth * 36, y: ry + sth * 36, z: 0 },
        up: { x: rdx, y: rdy, z: 0 },
        fov: 40,
      };
    }
    if (mode === "limb") {
      if (alt < 6000) {
        return {
          mode: mode,
          pos: { x: rx + ex * 160, y: ry + 28, z: 95 },
          look: { x: rx, y: ry + 8, z: 0 },
          up: { x: rdx, y: rdy, z: 0 },
          fov: 48,
        };
      }
      var side = 130 + Math.min(240, alt * 0.00055);
      return {
        mode: mode,
        pos: {
          x: rx + ex * side * 0.22 + rdx * 10,
          y: ry + ey * side * 0.22 + rdy * 10,
          z: side,
        },
        look: { x: rx, y: ry, z: 0 },
        up: { x: rdx, y: rdy, z: 0 },
        fov: 42,
      };
    }
    return {
      mode: "map",
      pos: { x: 0, y: R * 0.08, z: R * 4.8 },
      look: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: 28,
    };
  }

  function placeSun(R) {
    sunDir.set(1.0, 0.28, 0.42).normalize();
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
    sunDir = new THREE.Vector3(1.0, 0.28, 0.42).normalize();
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    makeEarthMaps();
    var R = 6371000;
    earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshStandardMaterial({
        map: colorMap,
        roughnessMap: roughMap,
        roughness: 0.78,
        metalness: 0.04,
        dithering: true,
      })
    );
    earth.receiveShadow = true;
    scene.add(earth);
    atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.032, 64, 48), atmoMaterial(false));
    scene.add(atmosphere);
    atmoInner = new THREE.Mesh(new THREE.SphereGeometry(R * 1.006, 64, 48), atmoMaterial(true));
    scene.add(atmoInner);
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.008, 64, 48),
      new THREE.MeshLambertMaterial({
        map: cloudMap,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
    );
    scene.add(clouds);
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1.6e6, 24, 16), skyMaterial());
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
    engineLight = new THREE.PointLight(0xff8a3a, 0, 260, 2);
    scene.add(engineLight);

    makeEnv();
    makePad(R);
    rocketGroup = new THREE.Group();
    scene.add(rocketGroup);
    makeStars();
    makeLines();
    ready = true;
    return true;
  }

  function resize(w, h) {
    if (!ready) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function reset() {
    camInited = false;
    lastStage = -1;
    lastVehicle = "";
    lastUiCam = "";
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
    while (debrisGroup.children.length < (list ? list.length : 0)) {
      var m = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.3, 14, 8),
        new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.55, metalness: 0.12 })
      );
      m.castShadow = true;
      debrisGroup.add(m);
    }
    for (var i = 0; i < debrisGroup.children.length; i += 1) {
      var d = list && list[i];
      var mesh = debrisGroup.children[i];
      if (!d) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(d.x, d.y, 0);
      scratchDir.set(Math.cos(d.theta), Math.sin(d.theta), 0);
      mesh.quaternion.setFromUnitVectors(scratchUp.set(0, 1, 0), scratchDir);
    }
  }

  function setPlume(mesh, visible, sx, sy, sz, throttle, vacuum, now) {
    if (!mesh) return;
    mesh.visible = visible;
    if (!visible) return;
    mesh.scale.set(sx, sy, sz);
    if (mesh.material && mesh.material.uniforms) {
      mesh.material.uniforms.time.value = now * 0.001;
      mesh.material.uniforms.throttle.value = throttle;
      mesh.material.uniforms.vacuum.value = vacuum;
    }
  }

  function render(opts) {
    if (!ready) return;
    var state = opts.state;
    var ui = opts.ui;
    var P = opts.P;
    var vehicle = opts.vehicle;
    var now = opts.now || 0;
    var R = state.planetRadius;
    var alt = P.altitude(state);
    var dawn = Math.max(0, 1 - alt / 90000);

    if (earth.geometry.parameters.radius !== R) {
      earth.geometry.dispose();
      earth.geometry = new THREE.SphereGeometry(R, 96, 64);
      atmosphere.geometry.dispose();
      atmosphere.geometry = new THREE.SphereGeometry(R * 1.032, 64, 48);
      atmoInner.geometry.dispose();
      atmoInner.geometry = new THREE.SphereGeometry(R * 1.006, 64, 48);
      clouds.geometry.dispose();
      clouds.geometry = new THREE.SphereGeometry(R * 1.008, 64, 48);
      padGroup.position.set(0, R, 0);
      placeSun(R);
    }

    if (vehicle.name !== lastVehicle || state.stage !== lastStage) {
      buildRocket(vehicle, state.stage);
    }

    rocketGroup.position.set(state.x, state.y, 0);
    scratchDir.set(Math.cos(state.theta), Math.sin(state.theta), 0);
    rocketGroup.quaternion.setFromUnitVectors(scratchUp.set(0, 1, 0), scratchDir);
    rocketGroup.visible = !state.crashed;
    var blob = rocketGroup.getObjectByName("padBlob");
    if (blob) blob.visible = alt < 8 && !state.crashed;

    var thrusting = state.ignited && state.throttle > 0.05 && state.fuelKg[state.stage] > 0 && !state.crashed;
    if (ui.cam) {
      ui.cam.shake *= 0.92;
      if (thrusting && alt < 4000 && !reduceMotion) ui.cam.shake = Math.max(ui.cam.shake, state.throttle * 0.7);
    }
    var vac = Math.min(1.85, 1 + alt / 70000);
    var flicker = reduceMotion ? 1 : 0.88 + 0.12 * Math.sin(now * 0.043);
    setPlume(plumeCore, thrusting, (0.55 + state.throttle * 0.55) * vac, 0.7 + state.throttle * 1.15 * vac, (0.55 + state.throttle * 0.55) * vac, state.throttle * flicker, vac, now);
    setPlume(plume, thrusting, (0.85 + state.throttle * 0.7) * vac, 0.85 + state.throttle * 1.35 * vac, (0.85 + state.throttle * 0.7) * vac, state.throttle * flicker, vac, now);
    if (plumeSmoke) {
      var smokeOn = thrusting && alt < 9000;
      plumeSmoke.visible = smokeOn;
      if (smokeOn) {
        var ss = 1.1 + (1 - alt / 9000) * 1.4 * state.throttle;
        plumeSmoke.scale.set(ss, 0.9 + state.throttle, ss);
        plumeSmoke.material.opacity = 0.1 + state.throttle * 0.14 * (1 - alt / 9000);
      }
    }
    engineLight.position.set(state.x, state.y, 6);
    engineLight.intensity = thrusting ? 6.2 * state.throttle * flicker * (alt < 8000 ? 1 : 0.32) : 0;

    var retract = (ui.phase === "count" && ui.countT < 3.5) || ui.phase === "flight";
    if (tower) tower.position.x = retract ? 36 : 14;
    padGroup.visible = alt < 25000;
    var floodAmt = (ui.phase === "count" || ui.phase === "hold") ? 2.0 * dawn : 0.28 * dawn;
    if (floodA) floodA.intensity = floodAmt;
    if (floodB) floodB.intensity = floodAmt * 0.75;
    hemi.intensity = 0.22 + dawn * 0.42;
    fill.intensity = 0.12 + dawn * 0.18;
    sun.intensity = 1.15 + dawn * 1.2;
    if (!reduceMotion) clouds.rotation.y = (now / 1000) * 0.0025;

    var want = desiredCam(state, ui, P);
    var showAtmo = want.mode === "map" || want.mode === "limb" || alt > 85000;
    atmosphere.visible = showAtmo;
    atmoInner.visible = showAtmo;
    clouds.visible = want.mode === "map" || want.mode === "limb" || alt > 18000;
    skyMesh.material.uniforms.dawn.value = want.mode === "map" ? Math.min(dawn, 0.08) : dawn;
    skyMesh.material.uniforms.horizon.value.set(dawn > 0.35 ? 0xffb078 : 0x1a2838);
    skyMesh.material.uniforms.zenith.value.set(dawn > 0.2 ? 0x4a5c78 : 0x05070c);
    if (stars) stars.visible = dawn < 0.55 || want.mode === "map" || want.mode === "limb";

    var nearPad = padGroup.visible && want.mode !== "map";
    if (nearPad !== padLit) {
      padLit = nearPad;
      sun.castShadow = nearPad;
    }

    var follow = ui.phase === "flight" && !reduceMotion && camInited ? 0.12 : 1;
    if (ui.camera !== lastUiCam) {
      follow = 1;
      lastUiCam = ui.camera;
    } else if (camInited) {
      var err = Math.hypot(want.pos.x - camPos.x, want.pos.y - camPos.y, want.pos.z - camPos.z);
      follow = Math.min(1, 0.14 + err / 1800);
    }
    lerp3(camPos, camPos, want.pos, follow);
    lerp3(camLook, camLook, want.look, follow);
    lerp3(camUp, camUp, want.up, Math.min(1, follow + 0.05));
    camFov = lerp(camFov, want.fov, follow);
    camInited = true;
    if (ui.cam && ui.cam.shake && !reduceMotion) {
      camera.position.set(
        camPos.x + (Math.random() - 0.5) * ui.cam.shake * 2.2,
        camPos.y + (Math.random() - 0.5) * ui.cam.shake * 2.2,
        camPos.z
      );
    } else {
      camera.position.set(camPos.x, camPos.y, camPos.z);
    }
    camera.up.set(camUp.x, camUp.y, camUp.z);
    camera.lookAt(camLook.x, camLook.y, camLook.z);
    camera.fov = camFov;
    camera.near = want.mode === "map" ? R * 0.02 : want.mode === "limb" && alt > 40000 ? 12 : 0.6;
    camera.far = want.mode === "map" || want.mode === "limb" ? R * 24 : 9e6;
    camera.updateProjectionMatrix();
    skyMesh.position.copy(camera.position);
    if (stars) stars.position.copy(camera.position);

    updateTrail(ui.history || []);
    updateOrbit(P, state, want.mode);
    updateDebris(state.debris);

    renderer.render(scene, camera);
  }

  root.Pad7Optical = {
    init: init,
    resize: resize,
    render: render,
    reset: reset,
    get ready() {
      return ready;
    },
  };
})(typeof self !== "undefined" ? self : this);
