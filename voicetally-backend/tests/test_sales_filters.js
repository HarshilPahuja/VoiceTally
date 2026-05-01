const { getSales, loadData } = require('../file_ingestion');
const logger = require('../logger');

async function testQuery(queryDesc, filters) {
    try {
        const data = await getSales(filters);
        console.log(`\n=== QUERY: ${queryDesc} ===`);
        console.log(`Matched: ${data.transaction_count} transactions. Total: $${data.total}`);
        console.log(`Detailed Records (max 3 shown):`);
        console.log(data.detailed_records.map(r => `${r.date} | ${r.customer} | $${r.amount} | ${r.status}`));
    } catch (err) {
        console.error(`Error in query "${queryDesc}":`, err);
    }
}

async function runTests() {
    await loadData(); // Prime the pump
    console.log("Data loaded. Starting tests...\n");

    await testQuery("All Sales", {});
    await testQuery("Sales Last Week", { period: 'week' });
    await testQuery("Sales Last Month", { period: 'month' });
    await testQuery("Sales Last Year", { period: 'year' });
    await testQuery("Pending Sales", { status: 'unpaid' });
    await testQuery("Paid Sales", { status: 'paid' });
    await testQuery("Sales for 'Customer A'", { customer: 'customer a' });
    await testQuery("Sales for 'Customer J'", { customer: 'customer j' });
    await testQuery("Sales last month for TechStart", { period: 'month', customer: 'customer g' });
}

runTests();


/*
import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { OrbitControls, Effects } from '@react-three/drei';
import { UnrealBloomPass } from 'three-stdlib';
import * as THREE from 'three';

extend({ UnrealBloomPass });

const ParticleSwarm = () => {
  const meshRef = useRef();
  const count = 5000;
  const speedMult = 0.9033942222595215;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const pColor = useMemo(() => new THREE.Color(), []);
  const color = pColor; // Alias for user code compatibility
  
  const positions = useMemo(() => {
     const pos = [];
     for(let i=0; i<count; i++) pos.push(new THREE.Vector3((Math.random()-0.5)*100, (Math.random()-0.5)*100, (Math.random()-0.5)*100));
     return pos;
  }, []);

  // Material & Geom
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff }), []);
  const geometry = useMemo(() => new THREE.TetrahedronGeometry(0.25), []);

  const PARAMS = useMemo(() => ({"spin":3.5,"jet":1.2,"disk":1,"mag":0.8,"wobble":0.3,"scale":38}), []);
  const addControl = (id, l, min, max, val) => {
      return PARAMS[id] !== undefined ? PARAMS[id] : val;
  };
  const setInfo = () => {};
  const annotate = () => {};

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime() * speedMult;
    const THREE_LIB = THREE;

    if(material.uniforms && material.uniforms.uTime) {
         material.uniforms.uTime.value = time;
    }

    for (let i = 0; i < count; i++) {
        // USER CODE START
        // ============================================================
        // PULSAR — Rotating Neutron Star with Relativistic Jets
        // Accretion disk, magnetosphere, polar beams, hot spots
        // ============================================================
        
        const spinRate  = addControl("spin",    "Spin Rate (RPM)",     0.1, 10.0, 3.5);
        const jetPower  = addControl("jet",     "Jet Power",           0,   2.0,  1.2);
        const diskMass  = addControl("disk",    "Accretion Disk Mass", 0,   2.0,  1.0);
        const magField  = addControl("mag",     "Magnetosphere",       0,   2.0,  0.8);
        const wobble    = addControl("wobble",  "Precession Wobble",   0,   1.0,  0.3);
        const scl       = addControl("scale",   "Scene Scale",         10,  80,   38);
        
        if (i === 0) {
          setInfo(
            "Millisecond Pulsar",
            "Neutron star spinning ~600x/sec. Magnetic poles misaligned with rotation axis emit lighthouse beams. Infalling matter forms accretion disk."
          );
          annotate("north", new THREE.Vector3(0,  scl * 1.8, 0), "North Magnetic Pole");
          annotate("south", new THREE.Vector3(0, -scl * 1.8, 0), "South Pole Jet");
          annotate("disk",  new THREE.Vector3(scl * 1.4, 0, 0),  "Accretion Disk");
        }
        
        // Per-particle deterministic seeds — golden ratio lattice, no allocation
        const PHI  = 1.6180339887;
        const u    = i / count;
        const s1   = (i * PHI)        % 1.0;
        const s2   = (i * 0.7548776)  % 1.0;
        const s3   = (i * 0.5698402)  % 1.0;
        const s4   = (i * 0.4142135)  % 1.0;
        
        // Pulsar spin axis — precesses slowly (wobble control)
        const precAngle = time * 0.11;
        const tiltAmt   = wobble * 0.35;
        const axisX     = Math.sin(precAngle) * tiltAmt;
        const axisZ     = Math.cos(precAngle) * tiltAmt;
        
        // Rotation angle for spinning features
        const spinAngle = time * spinRate * 0.8;
        const cosS = Math.cos(spinAngle), sinS = Math.sin(spinAngle);
        
        let lx = 0, ly = 0, lz = 0;
        let hue = 0.0, sat = 0.0, lit = 0.0;
        
        // ── PARTICLE ROLE DISTRIBUTION ──────────────────────────────
        //  0.00–0.04  Neutron star surface (hot, tiny, dense)
        //  0.04–0.08  Hot spot emission (magnetic poles on surface)
        //  0.08–0.32  Accretion disk (logarithmic spiral infall)
        //  0.32–0.50  Magnetosphere field lines (dipole arcs)
        //  0.50–0.68  North relativistic jet
        //  0.68–0.86  South relativistic jet
        //  0.86–1.00  Interstellar medium shock / nebula halo
        
        if (u < 0.04) {
          // ── NEUTRON STAR SURFACE ──────────────────────────────────
          // Ultra-dense sphere, radius ~10km. Hot X-ray emitting crust.
          // Map via Fibonacci sphere for even coverage
          const theta  = Math.acos(1.0 - 2.0 * s1);
          const phi    = s2 * 6.2831853;
          const r      = scl * 0.09 * (1.0 + Math.sin(s3 * 31.4 + time * spinRate * 2.0) * 0.04);
        
          lx = Math.sin(theta) * Math.cos(phi) * r;
          ly = Math.cos(theta) * r;
          lz = Math.sin(theta) * Math.sin(phi) * r;
        
          // Surface temp map: hotter at magnetic poles
          const poleness = Math.abs(Math.cos(theta));
          hue = 0.05 - poleness * 0.05;  // orange → red → near-UV blue at poles
          sat = 0.9;
          lit = 0.4 + poleness * 0.5;
        
        } else if (u < 0.08) {
          // ── HOT SPOTS — magnetic poles on surface ────────────────
          // Two antipodal caps, offset from rotation axis by tiltAmt
          const capSign  = (i % 2 === 0) ? 1.0 : -1.0;
          const capAngle = s1 * 6.2831853;
          const capR     = scl * 0.09;
          const capSpread = 0.18;  // angular radius of hot spot
        
          // Pole direction (tilted from Y axis by precession)
          const poleX    = axisX * capSign;
          const poleY    = capSign;
          const poleZ    = axisZ * capSign;
        
          // Scatter particles in a cap around the pole
          const scatter  = s2 * capSpread;
          const scatterA = s3 * 6.2831853;
        
          lx = (poleX + Math.sin(scatter) * Math.cos(scatterA)) * capR;
          ly = (poleY + Math.sin(scatter) * Math.sin(scatterA)) * capR;
          lz = (poleZ + Math.cos(scatter)) * capR * 0.3;
        
          // Pulsing X-ray hot spot: bright blue-white
          const pulse = 0.6 + 0.4 * Math.sin(time * spinRate * 6.2831 + capSign);
          hue = 0.62;
          sat = 0.95;
          lit = 0.5 + pulse * 0.5;
        
        } else if (u < 0.32) {
          // ── ACCRETION DISK ────────────────────────────────────────
          // Keplerian orbit: inner edge hot/bright, outer edge cool/dim
          // Logarithmic radial distribution (crowded near center)
          const diskFrac  = (u - 0.08) / 0.24;
        
          // Log-distributed radius: inner ~0.15, outer ~2.2 scale units
          const minR = scl * 0.14;
          const maxR = scl * 2.2;
          const rLog = minR * Math.pow(maxR / minR, s1);
        
          // Keplerian angular velocity: omega ∝ r^(-3/2)
          const omega    = diskMass * 1.4 * Math.pow(scl * 0.14 / rLog, 1.5);
          const diskAngle = s2 * 6.2831853 + omega * time;
        
          // Disk height: flares at outer edge (hydrostatic equilibrium)
          const flare    = rLog * 0.035 * Math.pow(rLog / minR, 0.3);
          const height   = (s3 - 0.5) * 2.0 * flare;
        
          // Disk is in the X-Z plane, tilted slightly by precession
          const flatX    = Math.cos(diskAngle) * rLog;
          const flatZ    = Math.sin(diskAngle) * rLog;
        
          lx = flatX;
          ly = height + flatX * axisX * 0.08;
          lz = flatZ;
        
          // Temperature: T ∝ r^(-3/4) — inner disk is blue-white, outer is deep red
          const tempFrac  = Math.pow(minR / rLog, 0.75);  // 1=inner hot, 0=outer cool
          hue = 0.62 - tempFrac * 0.58;  // blue (0.62) → orange (0.08) → red (0.04)
          sat = 0.85 + tempFrac * 0.15;
          lit = 0.25 + tempFrac * 0.6;
        
          // Spiral density waves (brightness variation)
          const spiralWave = Math.sin(diskAngle * 3.0 - rLog * 0.3 + time * diskMass) * 0.15;
          lit = Math.max(0.1, lit + spiralWave);
        
        } else if (u < 0.50) {
          // ── MAGNETOSPHERE — dipole field lines ───────────────────
          // Parametric dipole: r = r0 * sin²(lambda), traced as arcs
          // Field lines from surface to Alfvén radius
          const magFrac   = (u - 0.32) / 0.18;
        
          // Which field line (each line = a bundle of particles)
          const lineCount  = 24;
          const lineIdx    = Math.floor(s1 * lineCount);
          const lineT      = s2;  // 0=south pole, 1=north pole, along the arc
        
          // Field line azimuth — co-rotates with the star
          const lineAz    = (lineIdx / lineCount) * 6.2831853 + spinAngle;
        
          // Dipole arc: lambda is magnetic latitude, traces from -pi/2 to pi/2
          const lambda    = (lineT - 0.5) * Math.PI;
          const r0        = scl * (0.18 + (lineIdx % 4) * 0.28) * magField;
          const rArc      = r0 * Math.cos(lambda) * Math.cos(lambda);
        
          // Polar tilt — field axis precesses
          const arcX     = Math.sin(lineAz) * rArc;
          const arcY     = Math.sin(lambda) * r0 * 0.9;
          const arcZ     = Math.cos(lineAz) * rArc;
        
          // Apply tilt around Z axis
          lx = arcX + arcY * axisX;
          ly = arcY + arcX * axisX * 0.3;
          lz = arcZ + arcY * axisZ;
        
          // Colour by field strength: strongest near poles (blue), weakest at equator (purple)
          const fieldStr  = Math.abs(Math.sin(lambda));
          hue = 0.7 - fieldStr * 0.15;
          sat = 0.8 * magField;
          lit = 0.15 + fieldStr * 0.35 * magField;
        
        } else if (u < 0.68) {
          // ── NORTH RELATIVISTIC JET ───────────────────────────────
          // Plasma screaming out at ~0.99c along magnetic axis
          // Helical structure from magnetic pinch (Lorentz force)
          const jetFrac   = (u - 0.50) / 0.18;
        
          // Distance along jet: accelerates, then fans into lobe
          const jDist     = Math.pow(s1, 0.6) * scl * 2.8 * jetPower;
        
          // Helix radius grows with distance (jet widens)
          const jRadius   = jDist * 0.065 + scl * 0.02;
          const helixFreq = 8.0;
          const helixAngle = s2 * 6.2831853 * helixFreq + spinAngle * 2.0 + jDist * 0.4;
        
          // Helical position around jet axis
          const hx       = Math.cos(helixAngle) * jRadius * (0.5 + s3 * 0.5);
          const hz       = Math.sin(helixAngle) * jRadius * (0.5 + s3 * 0.5);
        
          // Apply magnetic axis tilt
          lx = hx + jDist * axisX;
          ly = jDist;    // along Y (north)
          lz = hz + jDist * axisZ;
        
          // Doppler boost: jet toward viewer is brighter/bluer
          const doppler  = 0.5 + 0.5 * Math.sin(helixAngle + time * spinRate);
          hue = 0.58 + doppler * 0.06;
          sat = 0.95;
          lit = (0.3 + doppler * 0.65) * jetPower;
        
          // Brightness pulses as jet is swept by lighthouse beam
          const beamPhase = ((spinAngle * 0.5) % 6.2831853) / 6.2831853;
          const beamBoost = Math.exp(-Math.pow(beamPhase - 0.5, 2) * 20.0) * 0.5;
          lit = Math.min(1.0, lit + beamBoost);
        
        } else if (u < 0.86) {
          // ── SOUTH JET (counter-jet, slightly dimmer — relativistic beaming) ──
          const jetFrac   = (u - 0.68) / 0.18;
          const jDist     = Math.pow(s1, 0.6) * scl * 2.8 * jetPower;
          const jRadius   = jDist * 0.065 + scl * 0.02;
          const helixAngle = s2 * 6.2831853 * 8.0 - spinAngle * 2.0 + jDist * 0.4;
        
          const hx       = Math.cos(helixAngle) * jRadius * (0.5 + s3 * 0.5);
          const hz       = Math.sin(helixAngle) * jRadius * (0.5 + s3 * 0.5);
        
          lx = hx - jDist * axisX;
          ly = -jDist;   // south
          lz = hz - jDist * axisZ;
        
          // Counter-jet: relativistically dimmed (receding)
          const doppler  = 0.3 + 0.3 * Math.abs(Math.sin(helixAngle));
          hue = 0.55;
          sat = 0.85;
          lit = doppler * 0.7 * jetPower;
        
        } else {
          // ── PULSAR WIND NEBULA / SHOCK FRONT ─────────────────────
          // Relativistic wind blows bubble in surrounding ISM
          // Torus-shaped termination shock where wind meets nebula
          const nebFrac   = (u - 0.86) / 0.14;
        
          // Torus geometry: major radius R, minor radius r
          const torusR    = scl * (1.6 + s1 * 1.2);
          const torusr    = scl * 0.3 + s2 * scl * 0.4;
          const torusA    = s3 * 6.2831853;      // angle around torus tube
          const torusB    = s4 * 6.2831853;      // angle around major circle
        
          // Torus is perpendicular to jet axis (in equatorial plane)
          const torusX    = (torusR + torusr * Math.cos(torusA)) * Math.cos(torusB);
          const torusY    = torusr * Math.sin(torusA) * 0.4;  // flattened
          const torusZ    = (torusR + torusr * Math.cos(torusA)) * Math.sin(torusB);
        
          lx = torusX;
          ly = torusY;
          lz = torusZ;
        
          // Nebula glows green/teal — synchrotron radiation
          const synchrotron = Math.sin(s1 * 12.0 + time * 0.3) * 0.5 + 0.5;
          hue = 0.45 + synchrotron * 0.1;
          sat = 0.7;
          lit = 0.08 + synchrotron * 0.18;
        }
        
        target.set(lx, ly, lz);
        color.setHSL(hue, sat, Math.min(1.0, Math.max(0.0, lit)));
        // USER CODE END

        positions[i].lerp(target, 0.1);
        dummy.position.copy(positions[i]);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        meshRef.current.setColorAt(i, pColor);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, count]} />
  );
};

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas camera={{ position: [0, 0, 100], fov: 60 }}>
        <fog attach="fog" args={['#000000', 0.01]} />
        <ParticleSwarm />
        <OrbitControls autoRotate={true} />
        <Effects disableGamma>
            <unrealBloomPass threshold={0} strength={1.8} radius={0.4} />
        </Effects>
      </Canvas>
    </div>
  );
}
*/