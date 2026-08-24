// Curated, higher-detail biology figures (asset pack).
//
// Path B of the realism work: instead of the earlier 3-ellipse "cell", these are
// hand-authored, anatomically-styled SVG figures with real organelle shapes
// (mitochondria with cristae, ER folds, Golgi stacks, ribosomes, centrioles, …)
// and a proper myelinated neuron. They reuse the Path-A shading helpers
// (Sphere / gradients / shadow from ../vizStyle) so they look 3D-ish, and they
// stay pure declarative SVG — editable, dark-mode safe, and exportable.
//
// This module is deliberately self-contained: each figure is a component that
// draws into the shared 760×520 viewBox used by IllustrationRenderer, so new
// figures (heart, neuron variants, flower, kidney, …) can be dropped in here
// and wired through the registry without touching the engine.

import { Sphere } from "../vizStyle";

const W = 760, H = 520;

// Leader-line label: a thin line from the organelle to the text, with a small
// dot at the anchor. `side` = "left" | "right" controls text alignment.
function Leader({ x, y, tx, ty, text, color = "#334155", side = "right" }) {
  return (
    <g>
      <line x1={x} y1={y} x2={tx} y2={ty} stroke="#94a3b8" strokeWidth="1" />
      <circle cx={x} cy={y} r="2.4" fill={color} />
      <text
        x={tx + (side === "right" ? 5 : -5)}
        y={ty + 3.5}
        fontSize="11.5"
        fontWeight="600"
        fill="currentColor"
        textAnchor={side === "right" ? "start" : "end"}
      >
        {text}
      </text>
    </g>
  );
}

// ---- Organelles ------------------------------------------------------------

// Mitochondrion: outer stadium membrane + inner folded cristae.
function Mitochondrion({ cx, cy, w = 88, h = 40, angle = 0 }) {
  const x = cx - w / 2, y = cy - h / 2;
  // A wavy inner membrane (cristae) that snakes back and forth inside.
  const steps = 7, amp = h * 0.28;
  let d = `M ${x + 8} ${cy}`;
  for (let i = 1; i <= steps; i++) {
    const px = x + 8 + (i / steps) * (w - 16);
    const py = cy + (i % 2 ? -amp : amp);
    d += ` Q ${px - (w - 16) / steps / 2} ${py} ${px} ${cy}`;
  }
  return (
    <g transform={`rotate(${angle} ${cx} ${cy})`} filter="url(#viz-shadow)">
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#fecaca" stroke="#dc2626" strokeWidth="2" />
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="url(#viz-gloss)" />
      <path d={d} fill="none" stroke="#dc2626" strokeWidth="1.5" opacity="0.85" />
    </g>
  );
}

// Golgi apparatus: a stack of curved cisternae + a few budding vesicles.
function Golgi({ cx, cy, flip = 1 }) {
  const arcs = 5, gap = 11;
  return (
    <g>
      {Array.from({ length: arcs }).map((_, i) => {
        const off = (i - (arcs - 1) / 2) * gap;
        const width = 96 - Math.abs(off) * 0.9;
        const y = cy + off;
        return (
          <path
            key={i}
            d={`M ${cx - width / 2} ${y} Q ${cx} ${y - flip * 20} ${cx + width / 2} ${y}`}
            fill="none"
            stroke="#0891b2"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        );
      })}
      {[[-18, 34], [14, 40], [30, 26]].map(([dx, dy], i) => (
        <Sphere key={i} cx={cx + dx} cy={cy + flip * dy} r={5} fill="#67e8f9" />
      ))}
    </g>
  );
}

// Endoplasmic reticulum: folded membrane ribbon. `rough` studs it with ribosomes.
function ER({ cx, cy, rough }) {
  const folds = 4, span = 130, y0 = cy - 34;
  let d = `M ${cx - span / 2} ${y0}`;
  const dots = [];
  for (let i = 0; i < folds; i++) {
    const yy = y0 + i * 22;
    const dir = i % 2 === 0 ? 1 : -1;
    d += ` q ${dir * span} 11 0 22`;
    if (rough) for (let k = 0; k <= 4; k++) dots.push([cx - span / 2 + dir * (k / 4) * span, yy + 11]);
  }
  return (
    <g>
      <path d={d} fill="none" stroke={rough ? "#7c3aed" : "#a855f7"} strokeWidth="3" strokeLinejoin="round" />
      {rough && dots.map(([dx, dy], i) => <circle key={i} cx={dx} cy={dy} r="2.4" fill="#4c1d95" />)}
    </g>
  );
}

// Scattered free ribosomes.
function Ribosomes({ cx, cy, n = 16, spread = 120 }) {
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const a = (i * 2.399) % (2 * Math.PI); // golden-angle scatter
        const r = spread * Math.sqrt((i + 1) / n);
        return <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a) * 0.7} r="2.6" fill="#f59e0b" />;
      })}
    </g>
  );
}

// Nucleus: shaded sphere + double nuclear envelope with pores + nucleolus.
function Nucleus({ cx, cy, r = 62 }) {
  const pores = 14;
  return (
    <g filter="url(#viz-shadow)">
      <Sphere cx={cx} cy={cy} r={r} fill="#c7d2fe" stroke="#4f46e5" strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={r - 5} fill="none" stroke="#6366f1" strokeWidth="1.4" opacity="0.7" />
      {Array.from({ length: pores }).map((_, i) => {
        const a = (i / pores) * 2 * Math.PI;
        return <circle key={i} cx={cx + (r - 2.5) * Math.cos(a)} cy={cy + (r - 2.5) * Math.sin(a)} r="2.6" fill="#4f46e5" />;
      })}
      <Sphere cx={cx + 12} cy={cy - 8} r={17} fill="#4f46e5" />
    </g>
  );
}

// Centrosome: a pair of perpendicular centrioles.
function Centrosome({ cx, cy }) {
  return (
    <g stroke="#0f766e" strokeWidth="5" strokeLinecap="round">
      <line x1={cx - 12} y1={cy - 6} x2={cx + 12} y2={cy - 6} />
      <line x1={cx - 2} y1={cy - 16} x2={cx - 2} y2={cy + 8} />
    </g>
  );
}

// ---- Animal cell -----------------------------------------------------------
export function AnimalCell({ showLabels = true }) {
  const cx = W / 2, cy = H / 2;
  const nx = cx - 96, ny = cy - 8; // nucleus centre
  return (
    <g>
      {/* Plasma membrane + cytoplasm */}
      <ellipse cx={cx} cy={cy} rx={318} ry={196} fill="#eef4ff" stroke="#3b82f6" strokeWidth="3" filter="url(#viz-shadow)" />
      <ellipse cx={cx} cy={cy} rx={318} ry={196} fill="url(#viz-gloss)" opacity="0.5" />

      {/* Endomembrane system around the nucleus */}
      <ER cx={nx + 96} cy={cy - 6} rough />
      <ER cx={nx - 78} cy={cy + 60} rough={false} />
      <Golgi cx={cx + 118} cy={cy + 78} flip={-1} />

      {/* Mitochondria */}
      <Mitochondrion cx={cx + 118} cy={cy - 96} angle={-18} />
      <Mitochondrion cx={cx - 150} cy={cy + 96} angle={22} w={78} />
      <Mitochondrion cx={cx + 176} cy={cy + 4} angle={72} w={72} />

      {/* Lysosomes + vesicles */}
      <Sphere cx={cx + 40} cy={cy + 118} r={16} fill="#22c55e" />
      <Sphere cx={cx - 190} cy={cy - 40} r={12} fill="#16a34a" />

      {/* Free ribosomes + centrosome */}
      <Ribosomes cx={cx + 40} cy={cy + 20} n={20} spread={150} />
      <Centrosome cx={cx - 40} cy={cy - 96} />

      {/* Nucleus (drawn last so it sits on top) */}
      <Nucleus cx={nx} cy={ny} r={62} />

      {showLabels && (
        <g>
          <Leader x={cx + 312} y={cy - 40} tx={W - 150} ty={cy - 120} text="Plasma membrane" color="#3b82f6" side="right" />
          <Leader x={nx} y={ny} tx={70} ty={cy - 150} text="Nucleus" color="#4f46e5" side="left" />
          <Leader x={nx + 12} y={ny - 8} tx={70} ty={cy - 124} text="Nucleolus" color="#4f46e5" side="left" />
          <Leader x={cx + 118} y={cy - 96} tx={W - 150} ty={cy - 60} text="Mitochondrion" color="#dc2626" side="right" />
          <Leader x={nx + 120} y={cy - 6} tx={W - 150} ty={cy + 4} text="Rough ER" color="#7c3aed" side="right" />
          <Leader x={nx - 116} y={cy + 60} tx={70} ty={cy + 40} text="Smooth ER" color="#a855f7" side="left" />
          <Leader x={cx + 118} y={cy + 78} tx={W - 150} ty={cy + 96} text="Golgi apparatus" color="#0891b2" side="right" />
          <Leader x={cx + 40} y={cy + 118} tx={W - 150} ty={cy + 150} text="Lysosome" color="#16a34a" side="right" />
          <Leader x={cx + 70} y={cy + 30} tx={70} ty={cy + 120} text="Ribosomes" color="#f59e0b" side="left" />
          <Leader x={cx - 40} y={cy - 96} tx={70} ty={cy - 96} text="Centrosome" color="#0f766e" side="left" />
        </g>
      )}
    </g>
  );
}

// ---- Plant cell ------------------------------------------------------------
export function PlantCell({ showLabels = true }) {
  const cx = W / 2, cy = H / 2;
  const nx = cx - 150, ny = cy - 70;
  return (
    <g>
      {/* Cell wall + membrane */}
      <rect x={cx - 300} y={cy - 180} width={600} height={360} rx="26" fill="#dcfce7" stroke="#15803d" strokeWidth="8" filter="url(#viz-shadow)" />
      <rect x={cx - 288} y={cy - 168} width={576} height={336} rx="20" fill="#f0fdf4" stroke="#65a30d" strokeWidth="2.5" />
      {/* Large central vacuole */}
      <ellipse cx={cx + 20} cy={cy} rx={190} ry={120} fill="#bfdbfe" stroke="#60a5fa" strokeWidth="2" opacity="0.75" />
      <ellipse cx={cx + 20} cy={cy} rx={190} ry={120} fill="url(#viz-gloss)" opacity="0.4" />
      {/* Chloroplasts (green ovals with grana) */}
      {[[cx - 210, cy - 90, 12], [cx - 190, cy + 70, -18], [cx + 150, cy - 120, 26], [cx + 210, cy + 90, -12], [cx - 40, cy + 150, 6]].map(([gx, gy, ga], i) => (
        <g key={i} transform={`rotate(${ga} ${gx} ${gy})`}>
          <ellipse cx={gx} cy={gy} rx="26" ry="14" fill="#22c55e" stroke="#15803d" strokeWidth="1.6" />
          <ellipse cx={gx} cy={gy} rx="26" ry="14" fill="url(#viz-gloss)" />
          {[-12, -4, 4, 12].map((o, k) => <line key={k} x1={gx + o} y1={gy - 5} x2={gx + o} y2={gy + 5} stroke="#166534" strokeWidth="2" strokeLinecap="round" />)}
        </g>
      ))}
      {/* Mitochondria */}
      <Mitochondrion cx={cx - 200} cy={cy + 130} angle={20} w={66} h={32} />
      <Mitochondrion cx={cx + 230} cy={cy - 40} angle={-70} w={60} h={30} />
      {/* Nucleus pushed to the edge by the vacuole */}
      <Nucleus cx={nx} cy={ny} r={50} />
      {showLabels && (
        <g>
          <Leader x={cx - 300} y={cy - 120} tx={80} ty={cy - 170} text="Cell wall" color="#15803d" side="left" />
          <Leader x={cx - 288} y={cy + 120} tx={80} ty={cy + 168} text="Cell membrane" color="#65a30d" side="left" />
          <Leader x={cx + 20} y={cy} tx={W - 120} ty={cy} text="Central vacuole" color="#3b82f6" side="right" />
          <Leader x={cx + 150} y={cy - 120} tx={W - 120} ty={cy - 150} text="Chloroplast" color="#15803d" side="right" />
          <Leader x={nx} y={ny} tx={80} ty={cy - 120} text="Nucleus" color="#4f46e5" side="left" />
          <Leader x={cx + 230} y={cy - 40} tx={W - 120} ty={cy - 60} text="Mitochondrion" color="#dc2626" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Neuron (myelinated motor neuron) --------------------------------------
export function Neuron({ showLabels = true }) {
  const somaX = 175, somaY = H / 2;
  const somaR = 52;
  // Dendrites: branches radiating to the upper-left of the soma.
  const dendrites = [];
  const baseAngles = [200, 168, 150, 132, 108];
  for (const deg of baseAngles) {
    const a = (deg * Math.PI) / 180;
    const x1 = somaX + somaR * Math.cos(a), y1 = somaY + somaR * Math.sin(a);
    const x2 = x1 + 78 * Math.cos(a), y2 = y1 + 78 * Math.sin(a);
    dendrites.push({ x1, y1, x2, y2, a });
  }
  // Axon: from the soma (hillock) straight to the right.
  const axonStartX = somaX + somaR, axonY = somaY;
  const axonEndX = 600;
  // Myelin segments with node-of-Ranvier gaps.
  const segW = 62, gap = 16, segH = 26;
  const segs = [];
  for (let x = axonStartX + 30; x + segW < axonEndX - 10; x += segW + gap) segs.push(x);
  // Terminal arborisation on the far right.
  const terminals = [];
  for (const deg of [-32, -12, 10, 30]) {
    const a = (deg * Math.PI) / 180;
    const x2 = axonEndX + 60 * Math.cos(a), y2 = axonY + 60 * Math.sin(a);
    terminals.push({ x2, y2 });
  }
  return (
    <g>
      {/* Dendrites (draw branches with a couple of forks) */}
      {dendrites.map((d, i) => {
        const fa1 = d.a - 0.32, fa2 = d.a + 0.32;
        return (
          <g key={i} stroke="#6366f1" strokeWidth="3" fill="none" strokeLinecap="round">
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
            <line x1={d.x2} y1={d.y2} x2={d.x2 + 34 * Math.cos(fa1)} y2={d.y2 + 34 * Math.sin(fa1)} strokeWidth="2" />
            <line x1={d.x2} y1={d.y2} x2={d.x2 + 34 * Math.cos(fa2)} y2={d.y2 + 34 * Math.sin(fa2)} strokeWidth="2" />
          </g>
        );
      })}

      {/* Axon core line (under the myelin) */}
      <line x1={axonStartX} y1={axonY} x2={axonEndX} y2={axonY} stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />

      {/* Myelin sheath segments (Schwann cells) with nodes of Ranvier between */}
      {segs.map((x, i) => (
        <g key={i} filter="url(#viz-shadow)">
          <rect x={x} y={axonY - segH / 2} width={segW} height={segH} rx={segH / 2} fill="#fde68a" stroke="#d97706" strokeWidth="2" />
          <rect x={x} y={axonY - segH / 2} width={segW} height={segH} rx={segH / 2} fill="url(#viz-gloss)" />
        </g>
      ))}

      {/* Terminal arborisation + synaptic boutons */}
      {terminals.map((t, i) => (
        <g key={i}>
          <line x1={axonEndX} y1={axonY} x2={t.x2} y2={t.y2} stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <Sphere cx={t.x2} cy={t.y2} r={7} fill="#10b981" />
        </g>
      ))}

      {/* Soma (cell body) + nucleus, drawn on top of dendrite/axon roots */}
      <g filter="url(#viz-shadow)">
        <Sphere cx={somaX} cy={somaY} r={somaR} fill="#c7d2fe" stroke="#4f46e5" strokeWidth={2.5} />
      </g>
      <Sphere cx={somaX + 8} cy={somaY - 4} r={20} fill="#4f46e5" />
      <Sphere cx={somaX + 8} cy={somaY - 4} r={7} fill="#312e81" />

      {showLabels && (
        <g>
          <Leader x={dendrites[0].x2} y={dendrites[0].y2} tx={70} ty={somaY + 150} text="Dendrites" color="#6366f1" side="left" />
          <Leader x={somaX} y={somaY + somaR} tx={somaX} ty={somaY + 150} text="Cell body (soma)" color="#4f46e5" side="right" />
          <Leader x={somaX + 8} y={somaY - 4} tx={somaX - 120} ty={somaY - 120} text="Nucleus" color="#312e81" side="left" />
          <Leader x={segs.length ? segs[0] + segW / 2 : 320} y={axonY} tx={segs.length ? segs[0] + segW / 2 : 320} ty={axonY - 110} text="Axon" color="#64748b" side="right" />
          <Leader x={segs.length ? segs[1] ?? segs[0] : 380} y={axonY} tx={(segs[1] ?? 380)} ty={axonY + 120} text="Myelin sheath" color="#d97706" side="right" />
          {segs.length > 1 && <Leader x={segs[1] - gap / 2} y={axonY} tx={segs[1] - gap / 2} ty={axonY - 70} text="Node of Ranvier" color="#334155" side="right" />}
          <Leader x={terminals[terminals.length - 1].x2} y={terminals[terminals.length - 1].y2} tx={W - 90} ty={axonY + 120} text="Axon terminals" color="#10b981" side="right" />
        </g>
      )}
    </g>
  );
}


// ---- Human heart (schematic, 4 chambers) -----------------------------------
// Textbook "facing you" convention: the person's RIGHT side is on the viewer's
// LEFT. Deoxygenated (right) chambers are blue, oxygenated (left) are red.
export function Heart({ showLabels = true }) {
  const cx = W / 2, cy = 300;
  const blue = "#2563eb", blueF = "#bfdbfe", red = "#dc2626", redF = "#fecaca";
  const apexX = cx - 12, apexY = cy + 158;
  const body = `M ${cx} ${cy - 118}
    C ${cx - 72} ${cy - 162} ${cx - 176} ${cy - 116} ${cx - 166} ${cy - 28}
    C ${cx - 158} ${cy + 44} ${cx - 88} ${cy + 116} ${apexX} ${apexY}
    C ${cx + 64} ${cy + 82} ${cx + 152} ${cy + 18} ${cx + 152} ${cy - 46}
    C ${cx + 152} ${cy - 122} ${cx + 70} ${cy - 160} ${cx} ${cy - 118} Z`;
  return (
    <g>
      {/* Great vessels (behind the body) */}
      <path d={`M ${cx - 96} 62 V ${cy - 90}`} stroke={blue} strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d={`M ${cx + 6} ${cy - 108} C ${cx + 6} ${cy - 210} ${cx + 100} ${cy - 214} ${cx + 116} ${cy - 150}`} stroke={red} strokeWidth="16" fill="none" strokeLinecap="round" />
      <path d={`M ${cx - 26} ${cy - 112} C ${cx - 26} ${cy - 188} ${cx + 44} ${cy - 196} ${cx + 70} ${cy - 156}`} stroke={blue} strokeWidth="13" fill="none" strokeLinecap="round" />
      {[[cx + 96, cy - 70], [cx + 104, cy - 40]].map(([x, y], i) => (
        <path key={i} d={`M ${x} ${y} h 34`} stroke={red} strokeWidth="8" fill="none" strokeLinecap="round" />
      ))}

      {/* Heart body */}
      <path d={body} fill="#fff1f2" stroke="#9f1239" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <path d={body} fill="url(#viz-gloss)" opacity="0.5" />

      {/* Chambers (kept inside the outline) */}
      <ellipse cx={cx - 74} cy={cy - 58} rx="52" ry="40" fill={blueF} stroke={blue} strokeWidth="1.5" />
      <ellipse cx={cx + 66} cy={cy - 58} rx="50" ry="38" fill={redF} stroke={red} strokeWidth="1.5" />
      <ellipse cx={cx - 58} cy={cy + 58} rx="58" ry="66" fill={blueF} stroke={blue} strokeWidth="1.5" />
      <ellipse cx={cx + 44} cy={cy + 60} rx="56" ry="74" fill={redF} stroke={red} strokeWidth="1.5" />

      {/* Septum + AV valves */}
      <path d={`M ${cx - 4} ${cy - 96} Q ${cx + 6} ${cy} ${apexX} ${apexY - 14}`} stroke="#9f1239" strokeWidth="2.5" fill="none" />
      <path d={`M ${cx - 118} ${cy - 6} q 40 -18 78 0`} stroke="#9f1239" strokeWidth="2" strokeDasharray="4 3" fill="none" />
      <path d={`M ${cx - 2} ${cy - 6} q 40 -18 78 0`} stroke="#9f1239" strokeWidth="2" strokeDasharray="4 3" fill="none" />

      {showLabels && (
        <g>
          <text x={cx - 74} y={cy - 55} fontSize="10.5" fontWeight="700" fill={blue} textAnchor="middle">RA</text>
          <text x={cx + 66} y={cy - 55} fontSize="10.5" fontWeight="700" fill={red} textAnchor="middle">LA</text>
          <text x={cx - 58} y={cy + 62} fontSize="10.5" fontWeight="700" fill={blue} textAnchor="middle">RV</text>
          <text x={cx + 44} y={cy + 64} fontSize="10.5" fontWeight="700" fill={red} textAnchor="middle">LV</text>
          <Leader x={cx + 40} y={cy - 190} tx={W - 120} ty={110} text="Aorta" color={red} side="right" />
          <Leader x={cx + 20} y={cy - 178} tx={W - 120} ty={150} text="Pulmonary artery" color={blue} side="right" />
          <Leader x={cx - 96} y={100} tx={70} ty={100} text="Superior vena cava" color={blue} side="left" />
          <Leader x={cx + 120} y={cy - 55} tx={W - 120} ty={cy - 40} text="Pulmonary veins" color={red} side="right" />
          <Leader x={cx - 118} y={cy - 6} tx={70} ty={cy - 60} text="Tricuspid valve" color="#9f1239" side="left" />
          <Leader x={cx + 76} y={cy - 6} tx={W - 120} ty={cy + 30} text="Bicuspid (mitral) valve" color="#9f1239" side="right" />
          <Leader x={apexX} y={apexY} tx={cx} ty={H - 24} text="Apex" color="#9f1239" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Flower (longitudinal section) -----------------------------------------
export function Flower({ showLabels = true }) {
  const cx = W / 2, base = 400; // receptacle top
  const petal = "#ec4899", petalF = "#fbcfe8", green = "#16a34a", greenF = "#bbf7d0";
  const stamen = "#f59e0b";
  return (
    <g>
      {/* Peduncle (stalk) */}
      <line x1={cx} y1={base + 10} x2={cx} y2={H - 20} stroke={green} strokeWidth="7" strokeLinecap="round" />
      {/* Receptacle */}
      <path d={`M ${cx - 34} ${base} Q ${cx} ${base + 40} ${cx + 34} ${base} Z`} fill={greenF} stroke={green} strokeWidth="2" />
      {/* Sepals */}
      {[-1, 1].map((d, i) => (
        <path key={i} d={`M ${cx + d * 24} ${base - 2} Q ${cx + d * 90} ${base + 18} ${cx + d * 70} ${base + 46}`} fill="none" stroke={green} strokeWidth="6" strokeLinecap="round" />
      ))}
      {/* Petals (flaring up and out) */}
      {[-1, 1].map((d, i) => (
        <path key={i} d={`M ${cx + d * 18} ${base - 4} C ${cx + d * 150} ${base - 40} ${cx + d * 170} ${base - 210} ${cx + d * 60} ${base - 250} C ${cx + d * 20} ${base - 150} ${cx + d * 26} ${base - 80} ${cx + d * 18} ${base - 4} Z`} fill={petalF} stroke={petal} strokeWidth="2" />
      ))}
      {/* Stamens (filament + anther) */}
      {[-1, 1].map((d, i) => (
        <g key={i}>
          <path d={`M ${cx + d * 10} ${base - 6} Q ${cx + d * 78} ${base - 120} ${cx + d * 60} ${base - 200}`} fill="none" stroke={stamen} strokeWidth="3" />
          <ellipse cx={cx + d * 60} cy={base - 208} rx="16" ry="9" transform={`rotate(${d * 20} ${cx + d * 60} ${base - 208})`} fill="#fbbf24" stroke="#b45309" strokeWidth="1.5" />
        </g>
      ))}
      {/* Pistil: ovary + style + stigma */}
      <ellipse cx={cx} cy={base - 30} rx="34" ry="46" fill={greenF} stroke={green} strokeWidth="2" filter="url(#viz-shadow)" />
      {[[-12, -34], [12, -34], [0, -18], [-12, -6], [12, -6]].map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx} cy={base - 30 + dy + 18} r="4.5" fill="#22c55e" stroke="#15803d" strokeWidth="1" />
      ))}
      <line x1={cx} y1={base - 74} x2={cx} y2={base - 220} stroke="#4d7c0f" strokeWidth="4" strokeLinecap="round" />
      <path d={`M ${cx - 22} ${base - 232} Q ${cx} ${base - 258} ${cx + 22} ${base - 232} Q ${cx} ${base - 214} ${cx - 22} ${base - 232} Z`} fill="#84cc16" stroke="#4d7c0f" strokeWidth="1.5" />

      {showLabels && (
        <g>
          <Leader x={cx - 120} y={base - 150} tx={70} ty={base - 210} text="Petal" color={petal} side="left" />
          <Leader x={cx - 70} y={base + 40} tx={70} ty={base + 60} text="Sepal" color={green} side="left" />
          <Leader x={cx - 60} y={base - 208} tx={70} ty={base - 250} text="Anther" color="#b45309" side="left" />
          <Leader x={cx - 40} y={base - 90} tx={70} ty={base - 120} text="Filament" color={stamen} side="left" />
          <Leader x={cx} y={base - 246} tx={W - 90} ty={base - 250} text="Stigma" color="#4d7c0f" side="right" />
          <Leader x={cx + 2} y={base - 150} tx={W - 90} ty={base - 170} text="Style" color="#4d7c0f" side="right" />
          <Leader x={cx + 30} y={base - 30} tx={W - 90} ty={base - 40} text="Ovary" color={green} side="right" />
          <Leader x={cx + 12} y={base - 12} tx={W - 90} ty={base + 30} text="Ovule" color="#15803d" side="right" />
          <Leader x={cx} y={base + 30} tx={70} ty={base + 120} text="Receptacle" color={green} side="left" />
        </g>
      )}
    </g>
  );
}

// ---- Digestive system (labelled GI tract) ----------------------------------
export function DigestiveSystem({ showLabels = true }) {
  const cx = W / 2 - 20;
  const tube = "#f472b6", tubeD = "#be185d", colon = "#fb923c", colonD = "#c2410c";
  return (
    <g>
      {/* Mouth + oesophagus */}
      <circle cx={cx} cy={54} r="12" fill="#fca5a5" stroke="#b91c1c" strokeWidth="2" />
      <path d={`M ${cx} 66 V 150`} stroke={tube} strokeWidth="12" fill="none" strokeLinecap="round" />
      {/* Stomach (J-shaped pouch, upper-left) */}
      <path d={`M ${cx} 150 C ${cx - 30} 165 ${cx - 120} 165 ${cx - 120} 220 C ${cx - 120} 270 ${cx - 60} 268 ${cx - 40} 244`}
        fill="#fbcfe8" stroke={tubeD} strokeWidth="3" filter="url(#viz-shadow)" />
      {/* Liver (upper-right blob) */}
      <path d={`M ${cx + 30} 150 Q ${cx + 160} 132 ${cx + 168} 196 Q ${cx + 120} 214 ${cx + 40} 200 Q ${cx + 20} 176 ${cx + 30} 150 Z`}
        fill="#b45309" stroke="#78350f" strokeWidth="2" filter="url(#viz-shadow)" opacity="0.9" />
      {/* Gallbladder */}
      <ellipse cx={cx + 44} cy={210} rx="10" ry="14" fill="#4d7c0f" stroke="#365314" strokeWidth="1.5" />
      {/* Pancreas (behind stomach) */}
      <path d={`M ${cx - 36} 250 Q ${cx + 40} 262 ${cx + 96} 244`} fill="none" stroke="#eab308" strokeWidth="12" strokeLinecap="round" opacity="0.85" />
      {/* Large intestine frame (colon) — drawn behind the small intestine */}
      <path d={`M ${cx + 150} 250 V 400 Q ${cx + 150} 430 ${cx + 118} 430 H ${cx - 118} Q ${cx - 150} 430 ${cx - 150} 400 V 300 Q ${cx - 150} 270 ${cx - 118} 270 H ${cx + 96}`}
        fill="none" stroke={colon} strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
      {/* Small intestine (coiled loops, centre) */}
      <path d={`M ${cx - 30} 268 C ${cx - 100} 300 ${cx + 100} 320 ${cx + 30} 350 C ${cx - 90} 372 ${cx + 90} 388 ${cx - 20} 408 C ${cx - 80} 418 ${cx + 60} 420 ${cx + 10} 408`}
        fill="none" stroke={tube} strokeWidth="13" strokeLinecap="round" />
      {/* Rectum */}
      <path d={`M ${cx - 118} 430 V 470`} stroke={colonD} strokeWidth="16" fill="none" strokeLinecap="round" />

      {showLabels && (
        <g>
          <Leader x={cx} y={54} tx={70} ty={54} text="Mouth" color="#b91c1c" side="left" />
          <Leader x={cx} y={110} tx={70} ty={120} text="Oesophagus" color={tubeD} side="left" />
          <Leader x={cx - 110} y={210} tx={70} ty={220} text="Stomach" color={tubeD} side="left" />
          <Leader x={cx + 120} y={175} tx={W - 70} ty={150} text="Liver" color="#78350f" side="right" />
          <Leader x={cx + 44} y={210} tx={W - 70} ty={210} text="Gallbladder" color="#365314" side="right" />
          <Leader x={cx + 60} y={250} tx={W - 70} ty={262} text="Pancreas" color="#a16207" side="right" />
          <Leader x={cx + 30} y={360} tx={70} ty={360} text="Small intestine" color={tubeD} side="left" />
          <Leader x={cx + 150} y={330} tx={W - 70} ty={340} text="Large intestine (colon)" color={colonD} side="right" />
          <Leader x={cx - 118} y={455} tx={70} ty={455} text="Rectum" color={colonD} side="left" />
        </g>
      )}
    </g>
  );
}
