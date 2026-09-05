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

import { PALETTE, Sphere } from "../vizStyle";

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


// ---- Respiratory system ----------------------------------------------------
export function Respiratory({ showLabels = true }) {
  const cx = W / 2;
  const cart = "#94a3b8", cartD = "#475569", lung = "#fecdd3", lungD = "#e11d48";
  const leftLung = `M ${cx - 46} 250 C ${cx - 176} 252 ${cx - 198} 384 ${cx - 150} 428 C ${cx - 96} 452 ${cx - 46} 430 ${cx - 46} 372 C ${cx - 46} 330 ${cx - 40} 296 ${cx - 46} 250 Z`;
  const rightLung = `M ${cx + 46} 250 C ${cx + 186} 252 ${cx + 210} 392 ${cx + 158} 434 C ${cx + 98} 456 ${cx + 46} 432 ${cx + 46} 372 C ${cx + 46} 326 ${cx + 40} 296 ${cx + 46} 250 Z`;
  return (
    <g>
      {/* Lungs (behind the airways) */}
      <path d={leftLung} fill={lung} stroke={lungD} strokeWidth="2.5" filter="url(#viz-shadow)" />
      <path d={rightLung} fill={lung} stroke={lungD} strokeWidth="2.5" filter="url(#viz-shadow)" />
      <path d={leftLung} fill="url(#viz-gloss)" opacity="0.5" />
      <path d={rightLung} fill="url(#viz-gloss)" opacity="0.5" />
      {/* Trachea with cartilage rings */}
      <rect x={cx - 14} y={58} width="28" height="152" rx="14" fill={cart} stroke={cartD} strokeWidth="2" />
      {Array.from({ length: 6 }).map((_, i) => <line key={i} x1={cx - 13} y1={80 + i * 22} x2={cx + 13} y2={80 + i * 22} stroke={cartD} strokeWidth="1.3" />)}
      {/* Primary bronchi */}
      <path d={`M ${cx - 6} 206 C ${cx - 40} 232 ${cx - 72} 252 ${cx - 96} 300`} stroke={cartD} strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={`M ${cx + 6} 206 C ${cx + 40} 232 ${cx + 72} 252 ${cx + 96} 300`} stroke={cartD} strokeWidth="10" fill="none" strokeLinecap="round" />
      {/* Bronchioles (branching inside each lung) */}
      {[-1, 1].map((d, i) => (
        <g key={i} stroke={cartD} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8">
          <path d={`M ${cx + d * 96} 300 q ${d * 20} 30 ${d * 14} 66`} />
          <path d={`M ${cx + d * 104} 340 q ${d * 34} 8 ${d * 44} 30`} strokeWidth="2" />
          <path d={`M ${cx + d * 100} 320 q ${d * -24} 20 ${d * -30} 48`} strokeWidth="2" />
        </g>
      ))}
      {/* Alveoli cluster (inset) */}
      {[[cx + 150, 360], [cx + 166, 350], [cx + 168, 372], [cx + 182, 362]].map(([ax, ay], i) => (
        <Sphere key={i} cx={ax} cy={ay} r={9} fill="#fda4af" />
      ))}
      {/* Diaphragm */}
      <path d={`M ${cx - 200} 452 Q ${cx} 500 ${cx + 208} 452`} stroke="#a16207" strokeWidth="6" fill="none" strokeLinecap="round" />
      {showLabels && (
        <g>
          <Leader x={cx} y={110} tx={70} ty={110} text="Trachea" color={cartD} side="left" />
          <Leader x={cx - 90} y={296} tx={70} ty={300} text="Bronchus" color={cartD} side="left" />
          <Leader x={cx - 120} y={356} tx={70} ty={380} text="Bronchioles" color={cartD} side="left" />
          <Leader x={cx - 120} y={380} tx={70} ty={430} text="Left lung" color={lungD} side="left" />
          <Leader x={cx + 130} y={300} tx={W - 80} ty={280} text="Right lung" color={lungD} side="right" />
          <Leader x={cx + 168} y={362} tx={W - 80} ty={370} text="Alveoli" color="#e11d48" side="right" />
          <Leader x={cx + 120} y={455} tx={W - 80} ty={470} text="Diaphragm" color="#a16207" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Eye (horizontal cross-section, front = left) --------------------------
export function Eye({ showLabels = true }) {
  const cx = W / 2 + 10, cy = H / 2, R = 150;
  return (
    <g>
      {/* Sclera + vitreous */}
      <circle cx={cx} cy={cy} r={R} fill="#eff6ff" stroke="#e5e7eb" strokeWidth="8" filter="url(#viz-shadow)" />
      <circle cx={cx} cy={cy} r={R} fill="#dbeafe" opacity="0.5" />
      {/* Retina (inner lining at the back) */}
      <path d={`M ${cx - R * 0.2} ${cy - R * 0.95} A ${R - 6} ${R - 6} 0 0 0 ${cx - R * 0.2} ${cy + R * 0.95}`} fill="none" stroke="#f59e0b" strokeWidth="6" />
      {/* Cornea (front bulge, left) */}
      <path d={`M ${cx - R * 0.86} ${cy - 62} Q ${cx - R - 34} ${cy} ${cx - R * 0.86} ${cy + 62}`} fill="#cffafe" stroke="#0891b2" strokeWidth="3" />
      {/* Iris + pupil + lens */}
      <line x1={cx - R * 0.86} y1={cy - 60} x2={cx - R * 0.86} y2={cy - 22} stroke="#7c3aed" strokeWidth="6" strokeLinecap="round" />
      <line x1={cx - R * 0.86} y1={cy + 22} x2={cx - R * 0.86} y2={cy + 60} stroke="#7c3aed" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx={cx - R * 0.72} cy={cy} rx="18" ry="40" fill="#bae6fd" stroke="#0284c7" strokeWidth="2.5" />
      {/* Optic nerve (exits back, slightly below axis) */}
      <path d={`M ${cx + R * 0.9} ${cy + 30} q 60 6 84 34`} stroke="#f59e0b" strokeWidth="16" fill="none" strokeLinecap="round" />
      <circle cx={cx + R * 0.86} cy={cy + 26} r="7" fill="#f59e0b" />
      {showLabels && (
        <g>
          <Leader x={cx - R - 20} y={cy} tx={70} ty={cy - 40} text="Cornea" color="#0891b2" side="left" />
          <Leader x={cx - R * 0.86} y={cy - 44} tx={70} ty={cy - 90} text="Iris" color="#7c3aed" side="left" />
          <Leader x={cx - R * 0.86} y={cy} tx={70} ty={cy + 10} text="Pupil" color="#334155" side="left" />
          <Leader x={cx - R * 0.72} y={cy + 40} tx={70} ty={cy + 90} text="Lens" color="#0284c7" side="left" />
          <Leader x={cx + R * 0.5} y={cy - R * 0.78} tx={W - 80} ty={cy - 120} text="Retina" color="#f59e0b" side="right" />
          <Leader x={cx + R * 0.95} y={cy - 30} tx={W - 80} ty={cy - 20} text="Sclera" color="#94a3b8" side="right" />
          <Leader x={cx + R + 60} y={cy + 60} tx={W - 80} ty={cy + 90} text="Optic nerve" color="#f59e0b" side="right" />
          <Leader x={cx + 30} y={cy} tx={cx + 30} ty={cy + R - 20} text="Vitreous humour" color="#3b82f6" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Nephron (functional unit of the kidney) -------------------------------
export function Nephron({ showLabels = true }) {
  const teal = "#0d9488", tealD = "#0f766e", red = "#dc2626";
  // A continuous tubule: Bowman's capsule → PCT → loop of Henle → DCT → duct.
  const tubule = `M 190 150 C 250 130 300 150 300 190 C 300 230 250 230 250 200
    C 250 178 280 178 288 200 C 320 300 320 300 340 420
    C 350 470 400 470 410 420 C 430 320 430 300 452 200
    C 458 176 486 176 492 198 C 500 240 470 246 470 210
    C 470 172 520 156 576 178`;
  return (
    <g>
      {/* Bowman's capsule + glomerulus */}
      <path d={`M 150 150 A 46 46 0 1 0 196 196`} fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
      <path d="M 150 150 q 22 -8 30 14 q 18 -6 12 18 q 16 8 -4 20 q 8 18 -18 12 q -14 14 -24 -8 q -20 2 -10 -22 q -10 -18 14 -22 q 0 -18 10 -12 Z"
        fill="none" stroke={red} strokeWidth="2.5" transform="translate(2 4)" />
      {/* Tubule */}
      <path d={tubule} fill="none" stroke={teal} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      {/* Collecting duct outlet */}
      <path d="M 576 178 C 610 200 610 380 590 460" fill="none" stroke={tealD} strokeWidth="12" strokeLinecap="round" />
      {showLabels && (
        <g>
          <Leader x={168} y={172} tx={70} ty={120} text="Glomerulus" color={red} side="left" />
          <Leader x={150} y={196} tx={70} ty={230} text="Bowman's capsule" color="#0284c7" side="left" />
          <Leader x={276} y={210} tx={70} ty={300} text="Proximal tubule (PCT)" color={teal} side="left" />
          <Leader x={378} y={430} tx={cx0(378)} ty={H - 20} text="Loop of Henle" color={teal} side="right" />
          <Leader x={470} y={210} tx={W - 80} ty={200} text="Distal tubule (DCT)" color={teal} side="right" />
          <Leader x={600} y={330} tx={W - 80} ty={340} text="Collecting duct" color={tealD} side="right" />
        </g>
      )}
    </g>
  );
}
// tiny helper so a downward leader stays on-canvas
function cx0(x) { return x; }

// ---- Ear -------------------------------------------------------------------
export function Ear({ showLabels = true }) {
  const cy = H / 2;
  const skin = "#fcd34d", skinD = "#b45309", bone = "#e2e8f0", boneD = "#64748b", nerve = "#f59e0b";
  // Cochlea spiral (inward)
  const turns = 2.6, steps = 120, sx = 560, sy = cy + 60, rMax = 46;
  let sp = "";
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * turns * 2 * Math.PI;
    const r = rMax * (1 - (i / steps) * 0.82);
    sp += `${i ? "L" : "M"} ${(sx + r * Math.cos(a)).toFixed(1)} ${(sy + r * Math.sin(a)).toFixed(1)} `;
  }
  return (
    <g>
      {/* Pinna (outer ear) */}
      <path d={`M 120 ${cy - 90} C 60 ${cy - 90} 60 ${cy + 90} 120 ${cy + 80} C 100 ${cy + 40} 150 ${cy + 30} 150 ${cy} C 150 ${cy - 40} 150 ${cy - 70} 120 ${cy - 90} Z`}
        fill={skin} stroke={skinD} strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* Ear canal */}
      <rect x={150} y={cy - 20} width="180" height="40" rx="8" fill="#fef3c7" stroke={skinD} strokeWidth="2" />
      {/* Eardrum */}
      <line x1={330} y1={cy - 26} x2={344} y2={cy + 26} stroke="#9a3412" strokeWidth="5" strokeLinecap="round" />
      {/* Ossicles (malleus, incus, stapes) */}
      <path d={`M 344 ${cy - 8} l 26 -14 l 22 18 l 20 -6`} fill="none" stroke={boneD} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {[[366, cy - 22], [392, cy - 4], [412, cy - 10]].map(([bx, by], i) => <Sphere key={i} cx={bx} cy={by} r={8} fill={bone} stroke={boneD} strokeWidth={1.5} />)}
      {/* Semicircular canals */}
      {[0, 1, 2].map((i) => (
        <ellipse key={i} cx={520} cy={cy - 70} rx="34" ry="16" transform={`rotate(${i * 60 - 60} 520 ${cy - 70})`} fill="none" stroke="#0891b2" strokeWidth="4" />
      ))}
      {/* Cochlea */}
      <path d={sp} fill="none" stroke="#0891b2" strokeWidth="6" strokeLinecap="round" />
      {/* Auditory nerve */}
      <path d={`M ${sx + 30} ${sy + 20} q 60 20 96 6`} stroke={nerve} strokeWidth="12" fill="none" strokeLinecap="round" />
      {/* Eustachian tube */}
      <path d={`M 400 ${cy + 12} q 20 60 -30 96`} stroke={skinD} strokeWidth="8" fill="none" strokeLinecap="round" />
      {showLabels && (
        <g>
          <Leader x={90} y={cy - 60} tx={70} ty={cy - 120} text="Pinna" color={skinD} side="left" />
          <Leader x={240} y={cy - 20} tx={200} ty={cy - 90} text="Ear canal" color={skinD} side="left" />
          <Leader x={337} y={cy} tx={300} ty={cy + 110} text="Eardrum" color="#9a3412" side="left" />
          <Leader x={392} y={cy - 4} tx={392} ty={cy - 90} text="Ossicles" color={boneD} side="right" />
          <Leader x={520} y={cy - 84} tx={W - 70} ty={cy - 120} text="Semicircular canals" color="#0891b2" side="right" />
          <Leader x={sx} y={sy} tx={W - 70} ty={cy + 40} text="Cochlea" color="#0891b2" side="right" />
          <Leader x={sx + 90} y={sy + 24} tx={W - 70} ty={cy + 110} text="Auditory nerve" color={nerve} side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Leaf cross-section ----------------------------------------------------
export function LeafSection({ showLabels = true }) {
  const x0 = 150, x1 = 610, top = 120, green = "#16a34a", greenD = "#15803d";
  const layerY = { cutT: top, upEpi: top + 6, palis: top + 46, spongy: top + 130, lowEpi: top + 206 };
  return (
    <g>
      {/* Upper cuticle + epidermis */}
      <line x1={x0} y1={layerY.cutT} x2={x1} y2={layerY.cutT} stroke="#f59e0b" strokeWidth="4" />
      {Array.from({ length: 10 }).map((_, i) => <rect key={i} x={x0 + i * ((x1 - x0) / 10)} y={layerY.upEpi} width={(x1 - x0) / 10 - 2} height="38" rx="6" fill="#dcfce7" stroke={greenD} strokeWidth="1.4" />)}
      {/* Palisade mesophyll (tall cells with chloroplasts) */}
      {Array.from({ length: 12 }).map((_, i) => {
        const px = x0 + 8 + i * ((x1 - x0 - 16) / 12);
        return (
          <g key={i}>
            <rect x={px} y={layerY.palis} width={(x1 - x0 - 16) / 12 - 4} height="78" rx="8" fill="#bbf7d0" stroke={greenD} strokeWidth="1.4" />
            {[0, 1, 2].map((k) => <circle key={k} cx={px + 12} cy={layerY.palis + 18 + k * 22} r="5" fill={green} />)}
          </g>
        );
      })}
      {/* Spongy mesophyll (rounded cells + air spaces) */}
      {Array.from({ length: 20 }).map((_, i) => {
        const gx = x0 + 20 + (i % 10) * ((x1 - x0 - 40) / 10);
        const gy = layerY.spongy + 12 + Math.floor(i / 10) * 34;
        return <circle key={i} cx={gx} cy={gy} r="15" fill="#86efac" stroke={greenD} strokeWidth="1.4" />;
      })}
      {/* Vein (vascular bundle): xylem (top) + phloem (bottom) */}
      <circle cx={(x0 + x1) / 2} cy={layerY.spongy + 40} r="26" fill="#fef9c3" stroke="#a16207" strokeWidth="2" />
      <path d={`M ${(x0 + x1) / 2 - 16} ${layerY.spongy + 34} h 32`} stroke="#b91c1c" strokeWidth="4" />
      <path d={`M ${(x0 + x1) / 2 - 16} ${layerY.spongy + 48} h 32`} stroke="#2563eb" strokeWidth="4" />
      {/* Lower epidermis + cuticle + stoma with guard cells */}
      {Array.from({ length: 10 }).map((_, i) => <rect key={i} x={x0 + i * ((x1 - x0) / 10)} y={layerY.lowEpi} width={(x1 - x0) / 10 - 2} height="34" rx="6" fill="#dcfce7" stroke={greenD} strokeWidth="1.4" />)}
      <line x1={x0} y1={layerY.lowEpi + 40} x2={x1} y2={layerY.lowEpi + 40} stroke="#f59e0b" strokeWidth="4" />
      <g>
        <path d={`M ${x0 + 250} ${layerY.lowEpi} q -18 20 0 40`} fill="none" stroke={greenD} strokeWidth="6" />
        <path d={`M ${x0 + 290} ${layerY.lowEpi} q 18 20 0 40`} fill="none" stroke={greenD} strokeWidth="6" />
      </g>
      {showLabels && (
        <g>
          <Leader x={x1} y={layerY.cutT} tx={W - 70} ty={top - 6} text="Cuticle" color="#a16207" side="right" />
          <Leader x={x1 - 30} y={layerY.upEpi + 18} tx={W - 70} ty={layerY.upEpi + 18} text="Upper epidermis" color={greenD} side="right" />
          <Leader x={x1 - 30} y={layerY.palis + 40} tx={W - 70} ty={layerY.palis + 40} text="Palisade mesophyll" color={greenD} side="right" />
          <Leader x={x1 - 30} y={layerY.spongy + 20} tx={W - 70} ty={layerY.spongy + 78} text="Spongy mesophyll" color={greenD} side="right" />
          <Leader x={(x0 + x1) / 2 + 26} y={layerY.spongy + 40} tx={W - 70} ty={layerY.spongy + 130} text="Vein (xylem/phloem)" color="#a16207" side="right" />
          <Leader x={x0 + 30} y={layerY.lowEpi + 16} tx={70} ty={layerY.lowEpi + 16} text="Lower epidermis" color={greenD} side="left" />
          <Leader x={x0 + 270} y={layerY.lowEpi + 40} tx={70} ty={layerY.lowEpi + 70} text="Stoma + guard cells" color={greenD} side="left" />
        </g>
      )}
    </g>
  );
}


// ---- Human skeleton (overview) ---------------------------------------------
export function Skeleton({ showLabels = true }) {
  const cx = W / 2, bone = "#e5e7eb", boneD = "#94a3b8";
  const B = (x1, y1, x2, y2, w = 11, k) => (
    <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={bone} strokeWidth={w} strokeLinecap="round" />
  );
  const ribs = [];
  for (let i = 0; i < 6; i++) {
    const y = 168 + i * 17, r = 34 + i * 6;
    ribs.push(<path key={`rl${i}`} d={`M ${cx - 6} ${y} Q ${cx - r} ${y + 6} ${cx - r + 6} ${y + 24}`} fill="none" stroke={bone} strokeWidth="5" strokeLinecap="round" />);
    ribs.push(<path key={`rr${i}`} d={`M ${cx + 6} ${y} Q ${cx + r} ${y + 6} ${cx + r - 6} ${y + 24}`} fill="none" stroke={bone} strokeWidth="5" strokeLinecap="round" />);
  }
  return (
    <g stroke={boneD} strokeWidth="0.6">
      {/* Skull + jaw */}
      <ellipse cx={cx} cy={80} rx="30" ry="34" fill={bone} />
      <path d={`M ${cx - 20} 96 Q ${cx} 124 ${cx + 20} 96`} fill={bone} stroke={boneD} strokeWidth="1" />
      {/* Spine */}
      {Array.from({ length: 12 }).map((_, i) => <circle key={i} cx={cx} cy={122 + i * 15} r="6" fill={bone} />)}
      {/* Clavicles + shoulders */}
      {B(cx, 140, cx - 66, 150, 7, "cl")}{B(cx, 140, cx + 66, 150, 7, "cr")}
      {/* Ribcage */}
      {ribs}
      {/* Arms: humerus + forearm */}
      {B(cx - 66, 150, cx - 96, 244, 10, "hl")}{B(cx - 96, 244, cx - 104, 330, 8, "fl")}
      {B(cx + 66, 150, cx + 96, 244, 10, "hr")}{B(cx + 96, 244, cx + 104, 330, 8, "fr")}
      {[[-108, 350], [108, 350]].map(([dx, dy], i) => <ellipse key={i} cx={cx + dx} cy={dy} rx="9" ry="13" fill={bone} />)}
      {/* Pelvis */}
      <path d={`M ${cx - 40} 300 Q ${cx} 328 ${cx + 40} 300 Q ${cx + 34} 344 ${cx} 336 Q ${cx - 34} 344 ${cx - 40} 300 Z`} fill={bone} stroke={boneD} strokeWidth="1" />
      {/* Legs: femur + shin */}
      {B(cx - 24, 330, cx - 34, 424, 12, "fel")}{B(cx - 34, 424, cx - 40, 496, 9, "til")}
      {B(cx + 24, 330, cx + 34, 424, 12, "fer")}{B(cx + 34, 424, cx + 40, 496, 9, "tir")}
      {[[-46, 508], [46, 508]].map(([dx, dy], i) => <path key={i} d={`M ${cx + dx} ${dy - 6} q ${dx < 0 ? -18 : 18} 10 ${dx < 0 ? -2 : 2} 14`} fill="none" stroke={bone} strokeWidth="7" strokeLinecap="round" />)}
      {showLabels && (
        <g stroke="none">
          <Leader x={cx + 26} y={80} tx={W - 90} ty={70} text="Skull" color={boneD} side="right" />
          <Leader x={cx + 40} y={150} tx={W - 90} ty={140} text="Clavicle" color={boneD} side="right" />
          <Leader x={cx + 48} y={210} tx={W - 90} ty={210} text="Ribs" color={boneD} side="right" />
          <Leader x={cx} y={230} tx={70} ty={210} text="Vertebral column" color={boneD} side="left" />
          <Leader x={cx - 96} y={210} tx={70} ty={150} text="Humerus" color={boneD} side="left" />
          <Leader x={cx - 100} y={300} tx={70} ty={300} text="Radius & ulna" color={boneD} side="left" />
          <Leader x={cx + 30} y={318} tx={W - 90} ty={300} text="Pelvis" color={boneD} side="right" />
          <Leader x={cx - 30} y={390} tx={70} ty={400} text="Femur" color={boneD} side="left" />
          <Leader x={cx + 38} y={470} tx={W - 90} ty={470} text="Tibia & fibula" color={boneD} side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Brain regions (lateral view, facing left) -----------------------------
export function Brain({ showLabels = true }) {
  const cx = W / 2 - 10, cy = 250;
  const outline = `M ${cx - 210} ${cy} C ${cx - 210} ${cy - 120} ${cx - 60} ${cy - 150} ${cx + 30} ${cy - 140}
    C ${cx + 150} ${cy - 128} ${cx + 210} ${cy - 70} ${cx + 200} ${cy - 10}
    C ${cx + 196} ${cy + 30} ${cx + 150} ${cy + 44} ${cx + 96} ${cy + 40}
    C ${cx + 40} ${cy + 60} ${cx - 120} ${cy + 60} ${cx - 210} ${cy} Z`;
  return (
    <g>
      <path d={outline} fill="#fecdd3" stroke="#be185d" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <path d={outline} fill="url(#viz-gloss)" opacity="0.5" />
      {/* Gyri (surface folds) */}
      {[[-150, -70], [-90, -96], [-10, -104], [70, -92], [140, -54], [-60, -30], [40, -26]].map(([dx, dy], i) => (
        <path key={i} d={`M ${cx + dx} ${cy + dy} q 20 -14 40 0 q 20 14 40 0`} fill="none" stroke="#be185d" strokeWidth="1.6" opacity="0.55" />
      ))}
      {/* Central + lateral sulcus dividers */}
      <path d={`M ${cx + 10} ${cy - 138} Q ${cx - 6} ${cy - 40} ${cx - 40} ${cy + 20}`} stroke="#9d174d" strokeWidth="2.2" fill="none" strokeDasharray="5 4" />
      <path d={`M ${cx - 150} ${cy + 6} Q ${cx - 20} ${cy + 30} ${cx + 120} ${cy + 6}`} stroke="#9d174d" strokeWidth="2.2" fill="none" strokeDasharray="5 4" />
      {/* Cerebellum (ridged blob, back-bottom) */}
      <path d={`M ${cx + 120} ${cy + 20} q 70 -6 78 44 q -4 40 -70 30 q -30 -6 -8 -74 Z`} fill="#fbcfe8" stroke="#be185d" strokeWidth="2" />
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M ${cx + 132} ${cy + 32 + i * 12} q 40 6 58 -2`} fill="none" stroke="#be185d" strokeWidth="1.2" opacity="0.6" />)}
      {/* Brainstem */}
      <path d={`M ${cx + 120} ${cy + 56} q -6 60 -20 96`} stroke="#a21caf" strokeWidth="16" fill="none" strokeLinecap="round" />
      {showLabels && (
        <g>
          <Leader x={cx - 150} y={cy - 70} tx={70} ty={cy - 130} text="Frontal lobe" color="#be185d" side="left" />
          <Leader x={cx + 10} y={cy - 120} tx={cx + 10} ty={70} text="Parietal lobe" color="#be185d" side="right" />
          <Leader x={cx - 90} y={cy + 20} tx={70} ty={cy + 90} text="Temporal lobe" color="#be185d" side="left" />
          <Leader x={cx + 150} y={cy - 40} tx={W - 80} ty={cy - 90} text="Occipital lobe" color="#be185d" side="right" />
          <Leader x={cx + 170} y={cy + 56} tx={W - 80} ty={cy + 60} text="Cerebellum" color="#be185d" side="right" />
          <Leader x={cx + 104} y={cy + 130} tx={cx + 104} ty={H - 20} text="Brainstem" color="#a21caf" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Water cycle -----------------------------------------------------------
export function WaterCycle({ showLabels = true }) {
  const blue = "#0ea5e9", green = "#16a34a", gray = "#64748b";
  return (
    <g>
      {/* Sun */}
      <Sphere cx={80} cy={70} r={30} fill="#fbbf24" />
      {Array.from({ length: 8 }).map((_, i) => { const a = (i / 8) * 2 * Math.PI; return <line key={i} x1={80 + 36 * Math.cos(a)} y1={70 + 36 * Math.sin(a)} x2={80 + 48 * Math.cos(a)} y2={70 + 48 * Math.sin(a)} stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />; })}
      {/* Ocean */}
      <path d={`M 380 ${H - 90} Q 520 ${H - 110} ${W} ${H - 96} L ${W} ${H} L 380 ${H} Z`} fill="#bae6fd" stroke={blue} strokeWidth="2" />
      {/* Mountains */}
      <path d={`M 40 ${H - 60} L 170 300 L 300 ${H - 60} Z`} fill="#cbd5e1" stroke={gray} strokeWidth="2" />
      <path d={`M 150 ${H - 60} L 260 340 L 380 ${H - 60} Z`} fill="#e2e8f0" stroke={gray} strokeWidth="2" />
      {/* Cloud */}
      <g filter="url(#viz-shadow)">
        {[[300, 120, 34], [340, 108, 40], [388, 118, 34], [430, 128, 28]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />)}
        <rect x={296} y={126} width={150} height={26} rx={13} fill="#f1f5f9" />
      </g>
      {/* Trees */}
      {[[90, H - 70], [130, H - 66]].map(([x, y], i) => <g key={i}><rect x={x - 3} y={y - 6} width="6" height="18" fill="#92400e" /><circle cx={x} cy={y - 12} r="12" fill={green} /></g>)}
      {/* Arrows: evaporation, transpiration, precipitation, runoff */}
      <path d={`M 560 ${H - 96} C 540 300 470 220 430 170`} stroke={blue} strokeWidth="4" fill="none" markerEnd="url(#il-arrow)" strokeDasharray="7 5" />
      <path d={`M 110 ${H - 84} C 150 320 220 220 300 160`} stroke={green} strokeWidth="3.5" fill="none" markerEnd="url(#il-arrow)" strokeDasharray="6 5" />
      {[330, 360, 392, 420].map((x, i) => <line key={i} x1={x} y1={168} x2={x - 26} y2={250} stroke={blue} strokeWidth="3" markerEnd="url(#il-arrow)" />)}
      <path d={`M 250 360 C 300 420 340 430 380 ${H - 92}`} stroke={blue} strokeWidth="5" fill="none" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <Leader x={520} y={300} tx={W - 70} ty={300} text="Evaporation" color={blue} side="right" />
          <Leader x={160} y={330} tx={70} ty={360} text="Transpiration" color={green} side="left" />
          <Leader x={360} y={210} tx={360} ty={70} text="Condensation → Precipitation" color={blue} side="right" />
          <Leader x={320} y={410} tx={70} ty={H - 40} text="Collection / Runoff" color={blue} side="left" />
        </g>
      )}
    </g>
  );
}

// ---- Rock cycle ------------------------------------------------------------
export function RockCycle({ showLabels = true }) {
  const nodes = {
    igneous: [W / 2, 110, "#ef4444", "Igneous"],
    sedimentary: [W - 180, 400, "#f59e0b", "Sedimentary"],
    metamorphic: [180, 400, "#8b5cf6", "Metamorphic"],
    magma: [W / 2, 300, "#dc2626", "Magma"],
  };
  const box = (x, y, color, text, k) => (
    <g key={k} filter="url(#viz-shadow)">
      <rect x={x - 76} y={y - 26} width="152" height="52" rx="12" fill="#fff" stroke={color} strokeWidth="2.5" />
      <text x={x} y={y + 5} fontSize="14" fontWeight="700" fill={color} textAnchor="middle">{text}</text>
    </g>
  );
  const arrow = (a, b, k) => {
    const [ax, ay] = a, [bx, by] = b;
    const mx = (ax + bx) / 2 + (ay - by) * 0.12, my = (ay + by) / 2 + (bx - ax) * 0.12;
    return <path key={k} d={`M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`} fill="none" stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />;
  };
  const I = nodes.igneous, S = nodes.sedimentary, M = nodes.metamorphic;
  return (
    <g>
      {arrow([I[0] + 40, I[1] + 26], [S[0], S[1] - 30], "is")}
      {arrow([S[0] - 40, S[1] - 10], [M[0] + 76, M[1]], "sm")}
      {arrow([M[0], M[1] - 30], [I[0] - 40, I[1] + 26], "mi")}
      {box(...nodes.igneous, "b1")}
      {box(...nodes.sedimentary, "b2")}
      {box(...nodes.metamorphic, "b3")}
      {showLabels && (
        <g>
          <text x={W / 2 + 150} y={250} fontSize="12" fontWeight="600" fill="#334155" textAnchor="middle">weathering,{"\u00A0"}erosion,{"\u00A0"}deposition</text>
          <text x={W / 2} y={H - 28} fontSize="12" fontWeight="600" fill="#334155" textAnchor="middle">heat & pressure →</text>
          <text x={W / 2 - 150} y={250} fontSize="12" fontWeight="600" fill="#334155" textAnchor="middle">melting → cooling</text>
        </g>
      )}
    </g>
  );
}

// ---- Circulatory loop (double circulation) ---------------------------------
export function Circulation({ showLabels = true }) {
  const cx = W / 2, red = "#dc2626", blue = "#2563eb";
  return (
    <g>
      {/* Lungs (top) */}
      {[-1, 1].map((d, i) => <path key={i} d={`M ${cx + d * 40} 70 C ${cx + d * 150} 66 ${cx + d * 150} 170 ${cx + d * 60} 168 C ${cx + d * 34} 140 ${cx + d * 34} 100 ${cx + d * 40} 70 Z`} fill="#fecdd3" stroke="#e11d48" strokeWidth="2" filter="url(#viz-shadow)" />)}
      <text x={cx} y={120} fontSize="14" fontWeight="700" fill="#e11d48" textAnchor="middle">Lungs</text>
      {/* Heart (centre) */}
      <g filter="url(#viz-shadow)">
        <path d={`M ${cx} ${H / 2 - 34} C ${cx - 40} ${H / 2 - 64} ${cx - 74} ${H / 2 - 20} ${cx} ${H / 2 + 40} C ${cx + 74} ${H / 2 - 20} ${cx + 40} ${H / 2 - 64} ${cx} ${H / 2 - 34} Z`} fill="#fca5a5" stroke="#9f1239" strokeWidth="2.5" />
      </g>
      <text x={cx} y={H / 2 + 4} fontSize="13" fontWeight="700" fill="#9f1239" textAnchor="middle">Heart</text>
      {/* Body tissues (bottom) */}
      <rect x={cx - 90} y={H - 120} width="180" height="70" rx="14" fill="#e2e8f0" stroke="#64748b" strokeWidth="2" filter="url(#viz-shadow)" />
      <text x={cx} y={H - 80} fontSize="14" fontWeight="700" fill="#475569" textAnchor="middle">Body tissues</text>
      {/* Pulmonary circuit (heart ↔ lungs) */}
      <path d={`M ${cx - 20} ${H / 2 - 40} C ${cx - 120} 220 ${cx - 120} 150 ${cx - 60} 150`} stroke={blue} strokeWidth="6" fill="none" markerEnd="url(#il-arrow)" />
      <path d={`M ${cx + 60} 150 C ${cx + 120} 150 ${cx + 120} 220 ${cx + 20} ${H / 2 - 40}`} stroke={red} strokeWidth="6" fill="none" markerEnd="url(#il-arrow)" />
      {/* Systemic circuit (heart ↔ body) */}
      <path d={`M ${cx + 22} ${H / 2 + 30} C ${cx + 120} ${H / 2 + 90} ${cx + 120} ${H - 90} ${cx + 60} ${H - 90}`} stroke={red} strokeWidth="6" fill="none" markerEnd="url(#il-arrow)" />
      <path d={`M ${cx - 60} ${H - 90} C ${cx - 120} ${H - 90} ${cx - 120} ${H / 2 + 90} ${cx - 22} ${H / 2 + 30}`} stroke={blue} strokeWidth="6" fill="none" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <Leader x={cx - 118} y={200} tx={70} ty={170} text="Pulmonary circulation" color={blue} side="left" />
          <Leader x={cx + 118} y={H / 2 + 120} tx={W - 70} ty={H / 2 + 150} text="Systemic circulation" color={red} side="right" />
          <text x={cx - 128} y={300} fontSize="10.5" fill={blue} textAnchor="middle">deoxygenated</text>
          <text x={cx + 128} y={300} fontSize="10.5" fill={red} textAnchor="middle">oxygenated</text>
        </g>
      )}
    </g>
  );
}


// ---- Shared helpers for node/arrow cycle diagrams --------------------------
function CycleBox({ x, y, color, text, w = 150 }) {
  return (
    <g filter="url(#viz-shadow)">
      <rect x={x - w / 2} y={y - 24} width={w} height="48" rx="12" fill="#fff" stroke={color} strokeWidth="2.5" />
      <text x={x} y={y + 5} fontSize="13" fontWeight="700" fill={color} textAnchor="middle">{text}</text>
    </g>
  );
}
function CurveArrow({ a, b, bow = 0.16, color = "#334155", label, k }) {
  const [ax, ay] = a, [bx, by] = b;
  const mx = (ax + bx) / 2 + (ay - by) * bow, my = (ay + by) / 2 + (bx - ax) * bow;
  return (
    <g key={k}>
      <path d={`M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`} fill="none" stroke={color} strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {label && <text x={mx} y={my - 4} fontSize="11" fontWeight="600" fill={color} textAnchor="middle">{label}</text>}
    </g>
  );
}

// ---- Solar system ----------------------------------------------------------
export function SolarSystem({ showLabels = true }) {
  const sx = 74, cy = H / 2;
  const planets = [
    ["Mercury", "#9ca3af", 5, 66], ["Venus", "#f59e0b", 8, 104], ["Earth", "#3b82f6", 8, 144],
    ["Mars", "#ef4444", 6, 186], ["Jupiter", "#d97706", 22, 262], ["Saturn", "#fcd34d", 18, 340],
    ["Uranus", "#22d3ee", 13, 410], ["Neptune", "#1d4ed8", 13, 466],
  ];
  return (
    <g>
      {/* Orbits */}
      {planets.map(([, , , d], i) => (
        <path key={i} d={`M ${sx} ${cy - d} A ${d} ${d} 0 0 1 ${sx} ${cy + d}`} fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 5" />
      ))}
      {/* Sun */}
      <g filter="url(#viz-shadow)"><Sphere cx={sx} cy={cy} r={46} fill="#f59e0b" /></g>
      <text x={sx} y={cy + 4} fontSize="13" fontWeight="800" fill="#fff" textAnchor="middle">Sun</text>
      {/* Planets */}
      {planets.map(([name, color, r, d], i) => {
        const px = sx + d, up = i % 2 === 0;
        return (
          <g key={i}>
            {name === "Saturn" && <ellipse cx={px} cy={cy} rx={r + 12} ry={r * 0.42} fill="none" stroke="#d4a373" strokeWidth="2.5" transform={`rotate(-18 ${px} ${cy})`} />}
            <Sphere cx={px} cy={cy} r={r} fill={color} />
            {showLabels && <text x={px} y={up ? cy - r - 8 : cy + r + 16} fontSize="10.5" fontWeight="600" fill={color} textAnchor="middle">{name}</text>}
          </g>
        );
      })}
    </g>
  );
}

// ---- Volcano (cross-section) -----------------------------------------------
export function Volcano({ showLabels = true }) {
  const cx = W / 2, ground = H - 70;
  const cone = `M ${cx - 240} ${ground} L ${cx - 44} 150 L ${cx + 44} 150 L ${cx + 240} ${ground} Z`;
  return (
    <g>
      {/* Ash cloud */}
      <g filter="url(#viz-shadow)">
        {[[cx - 40, 70, 30], [cx, 54, 40], [cx + 46, 68, 32], [cx + 4, 92, 30]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#9ca3af" />)}
      </g>
      {/* Cone with strata */}
      <path d={cone} fill="#a16207" stroke="#7c2d12" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {[0.28, 0.5, 0.72].map((t, i) => (
        <path key={i} d={`M ${cx - 44 - t * 196} ${150 + t * (ground - 150)} L ${cx + 44 + t * 196} ${150 + t * (ground - 150)}`} stroke="#78350f" strokeWidth="2" opacity="0.5" />
      ))}
      {/* Conduit + magma chamber */}
      <path d={`M ${cx} 150 L ${cx} ${ground - 10}`} stroke="#dc2626" strokeWidth="12" strokeLinecap="round" />
      <ellipse cx={cx} cy={ground + 6} rx="90" ry="46" fill="#ef4444" stroke="#991b1b" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <ellipse cx={cx} cy={ground + 6} rx="90" ry="46" fill="url(#viz-gloss)" opacity="0.5" />
      {/* Erupting lava + flow */}
      <path d={`M ${cx - 10} 150 Q ${cx} 96 ${cx + 12} 150`} fill="#f97316" stroke="#c2410c" strokeWidth="2" />
      <path d={`M ${cx + 30} 158 Q ${cx + 120} 210 ${cx + 170} ${ground}`} fill="none" stroke="#f97316" strokeWidth="7" strokeLinecap="round" />
      {showLabels && (
        <g>
          <Leader x={cx} y={150} tx={70} ty={140} text="Crater / vent" color="#c2410c" side="left" />
          <Leader x={cx} y={280} tx={70} ty={300} text="Conduit (pipe)" color="#dc2626" side="left" />
          <Leader x={cx} y={ground + 6} tx={70} ty={ground + 30} text="Magma chamber" color="#991b1b" side="left" />
          <Leader x={cx + 20} y={80} tx={W - 80} ty={70} text="Ash cloud" color="#64748b" side="right" />
          <Leader x={cx + 120} y={230} tx={W - 80} ty={230} text="Lava flow" color="#f97316" side="right" />
          <Leader x={cx - 150} y={ground - 40} tx={W - 80} ty={ground - 30} text="Layers (strata)" color="#78350f" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Tooth (cross-section) -------------------------------------------------
export function Tooth({ showLabels = true }) {
  const cx = W / 2, gum = 250;
  const dentine = `M ${cx - 70} 150 C ${cx - 84} 100 ${cx + 84} 100 ${cx + 70} 150
    C ${cx + 78} 210 ${cx + 46} 250 ${cx + 40} 260
    C ${cx + 40} 340 ${cx + 30} 420 ${cx + 18} 430 L ${cx + 8} 430
    C ${cx + 2} 360 ${cx - 2} 360 ${cx - 8} 430 L ${cx - 18} 430
    C ${cx - 30} 420 ${cx - 40} 340 ${cx - 40} 260
    C ${cx - 46} 250 ${cx - 78} 210 ${cx - 70} 150 Z`;
  const enamel = `M ${cx - 74} 158 C ${cx - 90} 96 ${cx + 90} 96 ${cx + 74} 158 C ${cx + 40} 176 ${cx - 40} 176 ${cx - 74} 158 Z`;
  return (
    <g>
      {/* Jawbone + gum */}
      <rect x={cx - 220} y={gum} width="440" height={H - gum - 20} rx="10" fill="#fde68a" stroke="#d97706" strokeWidth="1.5" opacity="0.5" />
      <path d={`M ${cx - 220} ${gum} Q ${cx} ${gum + 40} ${cx + 220} ${gum}`} fill="none" stroke="#fb7185" strokeWidth="14" />
      {/* Dentine body */}
      <path d={dentine} fill="#fde9b8" stroke="#b45309" strokeWidth="2" filter="url(#viz-shadow)" />
      {/* Enamel cap */}
      <path d={enamel} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      {/* Pulp cavity + nerve/vessels */}
      <path d={`M ${cx - 20} 150 C ${cx - 24} 200 ${cx - 8} 250 ${cx - 6} 300 L ${cx - 4} 400 L ${cx + 4} 400 L ${cx + 6} 300 C ${cx + 8} 250 ${cx + 24} 200 ${cx + 20} 150 C ${cx + 4} 170 ${cx - 4} 170 ${cx - 20} 150 Z`} fill="#fecaca" stroke="#e11d48" strokeWidth="1.5" />
      <line x1={cx - 1} y1={200} x2={cx - 1} y2={396} stroke="#dc2626" strokeWidth="1.6" />
      <line x1={cx + 3} y1={210} x2={cx + 3} y2={396} stroke="#2563eb" strokeWidth="1.6" />
      {showLabels && (
        <g>
          <Leader x={cx - 70} y={130} tx={70} ty={110} text="Enamel" color="#94a3b8" side="left" />
          <Leader x={cx - 60} y={200} tx={70} ty={200} text="Dentine" color="#b45309" side="left" />
          <Leader x={cx} y={230} tx={70} ty={280} text="Pulp cavity" color="#e11d48" side="left" />
          <Leader x={cx + 3} y={340} tx={W - 80} ty={330} text="Nerve & blood vessels" color="#dc2626" side="right" />
          <Leader x={cx + 140} y={gum + 6} tx={W - 80} ty={gum} text="Gum" color="#fb7185" side="right" />
          <Leader x={cx + 20} y={400} tx={W - 80} ty={410} text="Root" color="#b45309" side="right" />
          <Leader x={cx - 160} y={gum + 90} tx={70} ty={gum + 110} text="Jawbone" color="#d97706" side="left" />
        </g>
      )}
    </g>
  );
}

// ---- Carbon cycle ----------------------------------------------------------
export function CarbonCycle({ showLabels = true }) {
  const cx = W / 2;
  const atm = [cx, 70], plants = [180, 260], animals = [cx, 300], fossil = [180, 440], soil = [W - 180, 300], fuelUse = [W - 180, 440];
  return (
    <g>
      <CurveArrow a={[atm[0] - 60, atm[1] + 24]} b={[plants[0], plants[1] - 26]} label="photosynthesis" color="#16a34a" k="a1" />
      <CurveArrow a={[animals[0] - 20, animals[1] - 26]} b={[atm[0] + 20, atm[1] + 24]} label="respiration" color="#dc2626" k="a2" bow={-0.14} />
      <CurveArrow a={[plants[0] + 74, plants[1]]} b={[animals[0] - 78, animals[1]]} label="feeding" color="#334155" k="a3" bow={0.05} />
      <CurveArrow a={[soil[0], soil[1] - 26]} b={[atm[0] + 60, atm[1] + 24]} label="decay" color="#dc2626" k="a4" bow={0.2} />
      <CurveArrow a={[animals[0] + 20, animals[1] + 26]} b={[soil[0] - 74, soil[1]]} label="death" color="#334155" k="a5" bow={-0.1} />
      <CurveArrow a={[fuelUse[0], fuelUse[1] - 26]} b={[soil[0], soil[1] + 26]} label="" color="#334155" k="a6" bow={0} />
      <CurveArrow a={[fossil[0], fossil[1] - 26]} b={[plants[0], plants[1] + 26]} label="" color="#334155" k="a7" bow={0} />
      <CurveArrow a={[fuelUse[0] - 30, fuelUse[1] - 20]} b={[atm[0], atm[1] + 24]} label="combustion" color="#dc2626" k="a8" bow={0.28} />
      <CycleBox x={atm[0]} y={atm[1]} color="#0ea5e9" text="Atmospheric CO₂" w={170} />
      <CycleBox x={plants[0]} y={plants[1]} color="#16a34a" text="Plants" w={120} />
      <CycleBox x={animals[0]} y={animals[1]} color="#b45309" text="Animals" w={120} />
      <CycleBox x={soil[0]} y={soil[1]} color="#78350f" text="Decomposers" w={150} />
      <CycleBox x={fossil[0]} y={fossil[1]} color="#334155" text="Fossil fuels" w={140} />
      <CycleBox x={fuelUse[0]} y={fuelUse[1]} color="#334155" text="Combustion" w={140} />
    </g>
  );
}

// ---- Nitrogen cycle --------------------------------------------------------
export function NitrogenCycle({ showLabels = true }) {
  const cx = W / 2;
  const n2 = [cx, 66], nh = [170, 300], no2 = [cx, 430], no3 = [W - 170, 300], plants = [cx, 220];
  return (
    <g>
      <CurveArrow a={[n2[0] - 60, n2[1] + 24]} b={[nh[0], nh[1] - 26]} label="fixation" color="#7c3aed" k="n1" bow={0.18} />
      <CurveArrow a={[nh[0] + 74, nh[1]]} b={[no2[0] - 74, no2[1] - 6]} label="nitrification" color="#0891b2" k="n2" bow={-0.12} />
      <CurveArrow a={[no2[0] + 74, no2[1] - 6]} b={[no3[0] - 74, no3[1]]} label="nitrification" color="#0891b2" k="n3" bow={-0.12} />
      <CurveArrow a={[no3[0], no3[1] - 26]} b={[plants[0] + 74, plants[1]]} label="assimilation" color="#16a34a" k="n4" bow={0.16} />
      <CurveArrow a={[plants[0] - 74, plants[1]]} b={[nh[0], nh[1] - 30]} label="ammonification" color="#b45309" k="n5" bow={0.14} />
      <CurveArrow a={[no3[0], no3[1] + 26]} b={[n2[0] + 60, n2[1] + 24]} label="denitrification" color="#dc2626" k="n6" bow={0.34} />
      <CycleBox x={n2[0]} y={n2[1]} color="#2563eb" text="N₂ (atmosphere)" w={170} />
      <CycleBox x={plants[0]} y={plants[1]} color="#16a34a" text="Plants (proteins)" w={160} />
      <CycleBox x={nh[0]} y={nh[1]} color="#7c3aed" text="Ammonium NH₄⁺" w={160} />
      <CycleBox x={no2[0]} y={no2[1]} color="#0891b2" text="Nitrites NO₂⁻" w={140} />
      <CycleBox x={no3[0]} y={no3[1]} color="#0891b2" text="Nitrates NO₃⁻" w={140} />
    </g>
  );
}


// ---- Life-cycle ring helper -------------------------------------------------
// Lays `stages` [{ draw:(x,y)=>JSX, label }] evenly around a circle and draws
// clockwise arrows between them. Reused by the butterfly / frog / plant cycles.
function LifeCycle({ stages, cx = W / 2, cy = H / 2 + 10, R = 150 }) {
  const n = stages.length;
  const pos = stages.map((_, i) => { const a = -Math.PI / 2 + (i / n) * 2 * Math.PI; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; });
  return (
    <g>
      {pos.map((p, i) => {
        const q = pos[(i + 1) % n];
        const midA = -Math.PI / 2 + ((i + 0.5) / n) * 2 * Math.PI;
        const mx = cx + (R + 34) * Math.cos(midA), my = cy + (R + 34) * Math.sin(midA);
        return <path key={i} d={`M ${p.x + (q.x - p.x) * 0.22} ${p.y + (q.y - p.y) * 0.22} Q ${mx} ${my} ${q.x - (q.x - p.x) * 0.22} ${q.y - (q.y - p.y) * 0.22}`} fill="none" stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />;
      })}
      {stages.map((s, i) => (
        <g key={i}>
          {s.draw(pos[i].x, pos[i].y)}
          <text x={pos[i].x} y={pos[i].y + 56} fontSize="12.5" fontWeight="700" fill="currentColor" textAnchor="middle">{s.label}</text>
        </g>
      ))}
    </g>
  );
}

// ---- Phases of the Moon ----------------------------------------------------
export function MoonPhases({ showLabels = true }) {
  const cx = W / 2 - 24, cy = H / 2, R = 172, mr = 26;
  const names = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Third Quarter", "Waning Crescent"];
  return (
    <g>
      {/* Sunlight from the right */}
      {[-46, 0, 46].map((o, i) => <line key={i} x1={W - 34} y1={cy + o} x2={cx + R + mr + 14} y2={cy + o} stroke="#f59e0b" strokeWidth="3" markerEnd="url(#il-arrow)" />)}
      <text x={W - 40} y={cy - 78} fontSize="12" fontWeight="600" fill="#f59e0b" textAnchor="end">Sunlight</text>
      {/* Orbit + Earth */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 6" />
      <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={34} fill="#2563eb" /></g>
      <text x={cx} y={cy + 4} fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">Earth</text>
      {/* Moons: dark disc + lit RIGHT (sun-facing) half */}
      {names.map((name, i) => {
        const a = -(i / 8) * 2 * Math.PI;
        const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a), right = Math.cos(a) >= -0.01;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={mr} fill="#334155" stroke="#1e293b" strokeWidth="1" />
            <path d={`M ${x} ${y - mr} A ${mr} ${mr} 0 0 1 ${x} ${y + mr} Z`} fill="#f8fafc" />
            {showLabels && <text x={x + (right ? mr + 7 : -(mr + 7))} y={y + 3.5} fontSize="10" fontWeight="600" fill="currentColor" textAnchor={right ? "start" : "end"}>{name}</text>}
          </g>
        );
      })}
    </g>
  );
}

// ---- Photosynthesis --------------------------------------------------------
export function Photosynthesis({ showLabels = true }) {
  const cx = W / 2, cy = 250, green = "#16a34a";
  return (
    <g>
      {/* Sun + light */}
      <g filter="url(#viz-shadow)"><Sphere cx={96} cy={86} r={30} fill="#fbbf24" /></g>
      {[0, 1, 2].map((i) => <line key={i} x1={120} y1={106 + i * 8} x2={cx - 130} y2={cy - 40 + i * 10} stroke="#f59e0b" strokeWidth="3" markerEnd="url(#il-arrow)" />)}
      <text x={150} y={150} fontSize="11" fontWeight="600" fill="#f59e0b">Sunlight</text>
      {/* Leaf */}
      <path d={`M ${cx - 150} ${cy} Q ${cx} ${cy - 96} ${cx + 150} ${cy} Q ${cx} ${cy + 96} ${cx - 150} ${cy} Z`} fill="#bbf7d0" stroke={green} strokeWidth="2.5" filter="url(#viz-shadow)" />
      <line x1={cx - 140} y1={cy} x2={cx + 140} y2={cy} stroke={green} strokeWidth="2" />
      {[-1, 1].map((d) => [1, 2, 3].map((k) => <line key={`${d}-${k}`} x1={cx - 90 + k * 46} y1={cy} x2={cx - 90 + k * 46 + 18} y2={cy + d * 26} stroke={green} strokeWidth="1.4" />))}
      <text x={cx} y={cy + 6} fontSize="12" fontWeight="700" fill="#166534" textAnchor="middle">Glucose (C₆H₁₂O₆)</text>
      {/* Inputs / outputs */}
      <line x1={60} y1={cy + 70} x2={cx - 120} y2={cy + 24} stroke="#64748b" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      <line x1={cx} y1={H - 40} x2={cx} y2={cy + 60} stroke="#0ea5e9" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      <line x1={cx + 120} y1={cy - 30} x2={W - 70} y2={110} stroke="#0284c7" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      {/* Equation */}
      <text x={cx} y={H - 20} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂</text>
      {showLabels && (
        <g>
          <text x={54} y={cy + 84} fontSize="12" fontWeight="600" fill="#64748b" textAnchor="start">CO₂ (in)</text>
          <text x={cx + 8} y={H - 46} fontSize="12" fontWeight="600" fill="#0ea5e9">H₂O (from roots)</text>
          <text x={W - 66} y={104} fontSize="12" fontWeight="600" fill="#0284c7" textAnchor="end">O₂ (out)</text>
        </g>
      )}
    </g>
  );
}

// ---- Butterfly life cycle --------------------------------------------------
function iEgg(x, y) { return <g>{[[-8, -4], [4, -8], [10, 4], [-4, 8], [0, 0]].map(([dx, dy], i) => <ellipse key={i} cx={x + dx} cy={y + dy} rx="6" ry="8" fill="#fde68a" stroke="#ca8a04" strokeWidth="1" />)}<line x1={x - 22} y1={y + 16} x2={x + 22} y2={y + 16} stroke="#16a34a" strokeWidth="3" /></g>; }
function iCaterpillar(x, y) { return <g>{Array.from({ length: 6 }).map((_, i) => <circle key={i} cx={x - 26 + i * 11} cy={y} r="9" fill="#84cc16" stroke="#4d7c0f" strokeWidth="1.2" />)}<circle cx={x + 34} cy={y} r="10" fill="#65a30d" /><circle cx={x + 37} cy={y - 3} r="2" fill="#1e293b" /></g>; }
function iChrysalis(x, y) { return <g><path d={`M ${x} ${y - 22} Q ${x + 16} ${y - 6} ${x + 8} ${y + 20} Q ${x} ${y + 28} ${x - 8} ${y + 20} Q ${x - 16} ${y - 6} ${x} ${y - 22} Z`} fill="#a3e635" stroke="#4d7c0f" strokeWidth="1.5" /><line x1={x} y1={y - 30} x2={x} y2={y - 22} stroke="#4d7c0f" strokeWidth="2" /></g>; }
function iButterfly(x, y) { return <g><ellipse cx={x} cy={y} rx="3.5" ry="16" fill="#1e293b" />{[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => <ellipse key={i} cx={x + sx * 18} cy={y + sy * 12} rx="16" ry="11" fill={i < 2 ? "#f97316" : "#fb923c"} stroke="#c2410c" strokeWidth="1.2" />)}<line x1={x} y1={y - 14} x2={x - 6} y2={y - 24} stroke="#1e293b" strokeWidth="1.4" /><line x1={x} y1={y - 14} x2={x + 6} y2={y - 24} stroke="#1e293b" strokeWidth="1.4" /></g>; }
export function ButterflyLifeCycle({ showLabels = true }) {
  const stages = [
    { draw: iEgg, label: "Egg" }, { draw: iCaterpillar, label: "Caterpillar (larva)" },
    { draw: iChrysalis, label: "Chrysalis (pupa)" }, { draw: iButterfly, label: "Butterfly (adult)" },
  ];
  return <LifeCycle stages={showLabels ? stages : stages.map((s) => ({ ...s, label: "" }))} R={148} />;
}

// ---- Frog life cycle -------------------------------------------------------
function iSpawn(x, y) { return <g>{[[-10, -6], [2, -10], [12, -2], [-6, 6], [6, 8], [0, 0], [-14, 4]].map(([dx, dy], i) => <g key={i}><circle cx={x + dx} cy={y + dy} r="7" fill="#dbeafe" stroke="#60a5fa" strokeWidth="1" /><circle cx={x + dx} cy={y + dy} r="2.6" fill="#1e293b" /></g>)}</g>; }
function iTadpole(x, y) { return <g><circle cx={x - 6} cy={y} r="14" fill="#4b5563" /><path d={`M ${x + 6} ${y} Q ${x + 30} ${y - 14} ${x + 36} ${y} Q ${x + 30} ${y + 14} ${x + 6} ${y} Z`} fill="#6b7280" /><circle cx={x - 10} cy={y - 4} r="2.5" fill="#fff" /></g>; }
function iFroglet(x, y) { return <g><circle cx={x - 4} cy={y} r="15" fill="#16a34a" /><path d={`M ${x + 8} ${y} Q ${x + 26} ${y - 10} ${x + 30} ${y} Q ${x + 26} ${y + 10} ${x + 8} ${y} Z`} fill="#22c55e" /><line x1={x - 6} y1={y + 12} x2={x - 14} y2={y + 22} stroke="#15803d" strokeWidth="3" strokeLinecap="round" /><line x1={x + 4} y1={y + 12} x2={x + 10} y2={y + 24} stroke="#15803d" strokeWidth="3" strokeLinecap="round" /></g>; }
function iFrog(x, y) { return <g><ellipse cx={x} cy={y + 4} rx="22" ry="16" fill="#16a34a" stroke="#15803d" strokeWidth="1.5" />{[-1, 1].map((d, i) => <circle key={i} cx={x + d * 9} cy={y - 10} r="7" fill="#22c55e" stroke="#15803d" strokeWidth="1.2" />)}{[-1, 1].map((d, i) => <circle key={`e${i}`} cx={x + d * 9} cy={y - 11} r="2.6" fill="#1e293b" />)}{[-1, 1].map((d, i) => <line key={`l${i}`} x1={x + d * 16} y1={y + 14} x2={x + d * 28} y2={y + 24} stroke="#15803d" strokeWidth="4" strokeLinecap="round" />)}</g>; }
export function FrogLifeCycle({ showLabels = true }) {
  const stages = [
    { draw: iSpawn, label: "Eggs (frogspawn)" }, { draw: iTadpole, label: "Tadpole" },
    { draw: iFroglet, label: "Froglet" }, { draw: iFrog, label: "Adult frog" },
  ];
  return <LifeCycle stages={showLabels ? stages : stages.map((s) => ({ ...s, label: "" }))} R={148} />;
}

// ---- Plant life cycle ------------------------------------------------------
function iSeed(x, y) { return <ellipse cx={x} cy={y} rx="14" ry="10" fill="#a16207" stroke="#78350f" strokeWidth="1.5" transform={`rotate(-20 ${x} ${y})`} />; }
function iGerm(x, y) { return <g><ellipse cx={x} cy={y - 4} rx="12" ry="8" fill="#a16207" stroke="#78350f" strokeWidth="1.2" /><path d={`M ${x} ${y + 2} q -6 14 -12 22`} fill="none" stroke="#92400e" strokeWidth="2.5" /><path d={`M ${x} ${y - 4} q 2 -16 8 -22`} fill="none" stroke="#16a34a" strokeWidth="2.5" /></g>; }
function iSeedling(x, y) { return <g><line x1={x} y1={y + 24} x2={x} y2={y - 14} stroke="#16a34a" strokeWidth="3" /><path d={`M ${x} ${y - 4} q -22 -6 -26 -22 q 20 -2 26 18`} fill="#22c55e" stroke="#15803d" strokeWidth="1" /><path d={`M ${x} ${y - 4} q 22 -6 26 -22 q -20 -2 -26 18`} fill="#22c55e" stroke="#15803d" strokeWidth="1" /></g>; }
function iFlowering(x, y) { return <g><line x1={x} y1={y + 28} x2={x} y2={y - 20} stroke="#16a34a" strokeWidth="3" /><path d={`M ${x} ${y + 6} q -22 -4 -28 -20 q 22 -2 28 16`} fill="#22c55e" stroke="#15803d" strokeWidth="1" /><path d={`M ${x} ${y + 2} q 22 -4 28 -20 q -22 -2 -28 16`} fill="#22c55e" stroke="#15803d" strokeWidth="1" />{[0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + i * (2 * Math.PI / 5); return <ellipse key={i} cx={x + 12 * Math.cos(a)} cy={y - 22 + 12 * Math.sin(a)} rx="8" ry="5" fill="#ec4899" transform={`rotate(${(a * 180) / Math.PI + 90} ${x + 12 * Math.cos(a)} ${y - 22 + 12 * Math.sin(a)})`} />; })}<circle cx={x} cy={y - 22} r="6" fill="#f59e0b" /></g>; }
export function PlantLifeCycle({ showLabels = true }) {
  const stages = [
    { draw: iSeed, label: "Seed" }, { draw: iGerm, label: "Germination" },
    { draw: iSeedling, label: "Seedling" }, { draw: iFlowering, label: "Flowering plant" },
  ];
  return <LifeCycle stages={showLabels ? stages : stages.map((s) => ({ ...s, label: "" }))} R={150} />;
}


// ---- States of matter ------------------------------------------------------
export function StatesOfMatter({ showLabels = true }) {
  const bw = 200, bh = 190, gap = 40, y = 150;
  const x0 = (W - (3 * bw + 2 * gap)) / 2;
  const box = (bx, title, color) => <rect x={bx} y={y} width={bw} height={bh} rx="12" fill="#f8fafc" stroke={color} strokeWidth="2.5" filter="url(#viz-shadow)" />;
  const solid = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) solid.push([x0 + 34 + c * 33, y + 40 + r * 30]);
  const liquid = []; for (let i = 0; i < 16; i++) { const row = Math.floor(i / 5); liquid.push([x0 + bw + gap + 30 + (i % 5) * 32 + (row % 2 ? 12 : 0), y + 90 + row * 30]); }
  const gas = Array.from({ length: 8 }).map((_, i) => { const a = i * 2.399; return [x0 + 2 * (bw + gap) + bw / 2 + 66 * Math.cos(a), y + bh / 2 + 60 * Math.sin(a)]; });
  return (
    <g>
      {box(x0, "Solid", "#2563eb")}
      {box(x0 + bw + gap, "Liquid", "#0891b2")}
      {box(x0 + 2 * (bw + gap), "Gas", "#dc2626")}
      {solid.map(([x, y2], i) => <Sphere key={`s${i}`} cx={x} cy={y2} r={11} fill="#3b82f6" />)}
      {liquid.map(([x, y2], i) => <Sphere key={`l${i}`} cx={x} cy={y2} r={11} fill="#06b6d4" />)}
      {gas.map(([x, y2], i) => <Sphere key={`g${i}`} cx={x} cy={y2} r={11} fill="#ef4444" />)}
      {/* change-of-state arrows */}
      <line x1={x0 + bw} y1={y - 18} x2={x0 + bw + gap} y2={y - 18} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />
      <line x1={x0 + bw + gap} y1={y - 2} x2={x0 + bw} y2={y - 2} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />
      <line x1={x0 + 2 * bw + gap} y1={y - 18} x2={x0 + 2 * (bw + gap)} y2={y - 18} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />
      <line x1={x0 + 2 * (bw + gap)} y1={y - 2} x2={x0 + 2 * bw + gap} y2={y - 2} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={x0 + bw / 2} y={y + bh + 26} fontSize="14" fontWeight="700" fill="#2563eb" textAnchor="middle">Solid</text>
          <text x={x0 + bw + gap + bw / 2} y={y + bh + 26} fontSize="14" fontWeight="700" fill="#0891b2" textAnchor="middle">Liquid</text>
          <text x={x0 + 2 * (bw + gap) + bw / 2} y={y + bh + 26} fontSize="14" fontWeight="700" fill="#dc2626" textAnchor="middle">Gas</text>
          <text x={x0 + bw + gap / 2} y={y - 24} fontSize="10" fill="#334155" textAnchor="middle">melt</text>
          <text x={x0 + bw + gap / 2} y={y + 10} fontSize="10" fill="#334155" textAnchor="middle">freeze</text>
          <text x={x0 + 2 * bw + gap + gap / 2} y={y - 24} fontSize="10" fill="#334155" textAnchor="middle">evaporate</text>
          <text x={x0 + 2 * bw + gap + gap / 2} y={y + 10} fontSize="10" fill="#334155" textAnchor="middle">condense</text>
        </g>
      )}
    </g>
  );
}

// ---- pH scale --------------------------------------------------------------
export function PhScale({ showLabels = true }) {
  const colors = ["#b91c1c", "#dc2626", "#ea580c", "#f97316", "#f59e0b", "#eab308", "#facc15", "#84cc16", "#22c55e", "#10b981", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#7c3aed"];
  const n = 15, x0 = 60, x1 = W - 60, seg = (x1 - x0) / n, y = H / 2 - 30, h = 70;
  return (
    <g>
      {colors.map((c, i) => (
        <g key={i}>
          <rect x={x0 + i * seg} y={y} width={seg} height={h} fill={c} />
          <text x={x0 + i * seg + seg / 2} y={y + h + 20} fontSize="12" fontWeight="700" fill="currentColor" textAnchor="middle">{i}</text>
        </g>
      ))}
      <rect x={x0} y={y} width={x1 - x0} height={h} fill="none" stroke="#334155" strokeWidth="2" rx="4" />
      {showLabels && (
        <g>
          <text x={x0 + 3.5 * seg} y={y - 16} fontSize="14" fontWeight="700" fill="#dc2626" textAnchor="middle">ACIDIC</text>
          <text x={x0 + 7.5 * seg} y={y - 16} fontSize="13" fontWeight="700" fill="#16a34a" textAnchor="middle">NEUTRAL</text>
          <text x={x0 + 11.5 * seg} y={y - 16} fontSize="14" fontWeight="700" fill="#2563eb" textAnchor="middle">ALKALINE</text>
          <line x1={x0 + 7 * seg + seg / 2} y1={y - 6} x2={x0 + 7 * seg + seg / 2} y2={y} stroke="#16a34a" strokeWidth="2" />
          <text x={W / 2} y={y + h + 48} fontSize="12" fill="#64748b" textAnchor="middle">pH 7 = neutral (pure water) · lower = more acidic · higher = more alkaline</text>
        </g>
      )}
    </g>
  );
}

// ---- Electromagnetic spectrum ----------------------------------------------
export function EMSpectrum({ showLabels = true }) {
  const bands = [
    ["Radio", "#7c3aed"], ["Microwave", "#2563eb"], ["Infrared", "#dc2626"],
    ["Visible", "__rainbow__"], ["Ultraviolet", "#8b5cf6"], ["X-ray", "#0891b2"], ["Gamma", "#334155"],
  ];
  const rainbow = ["#7c3aed", "#2563eb", "#06b6d4", "#22c55e", "#eab308", "#f97316", "#ef4444"];
  const x0 = 50, x1 = W - 50, y = H / 2 - 40, h = 74, bw = (x1 - x0) / bands.length;
  return (
    <g>
      {bands.map(([name, color], i) => {
        const bx = x0 + i * bw;
        return (
          <g key={i}>
            {color === "__rainbow__"
              ? rainbow.map((c, k) => <rect key={k} x={bx + (k * bw) / rainbow.length} y={y} width={bw / rainbow.length + 0.6} height={h} fill={c} />)
              : <rect x={bx} y={y} width={bw} height={h} fill={color} />}
            <text x={bx + bw / 2} y={y + h + 22} fontSize="11.5" fontWeight="700" fill="currentColor" textAnchor="middle">{name}</text>
          </g>
        );
      })}
      <rect x={x0} y={y} width={x1 - x0} height={h} fill="none" stroke="#334155" strokeWidth="2" />
      {showLabels && (
        <g>
          <line x1={x0} y1={y - 20} x2={x0 + 150} y2={y - 20} stroke="#334155" strokeWidth="2" markerStart="url(#il-arrow)" />
          <text x={x0 + 4} y={y - 26} fontSize="11" fontWeight="600" fill="#334155">longer wavelength</text>
          <line x1={x1} y1={y - 20} x2={x1 - 150} y2={y - 20} stroke="#334155" strokeWidth="2" markerStart="url(#il-arrow)" />
          <text x={x1 - 4} y={y - 26} fontSize="11" fontWeight="600" fill="#334155" textAnchor="end">higher frequency / energy</text>
        </g>
      )}
    </g>
  );
}

// ---- Energy (trophic) pyramid ----------------------------------------------
export function EnergyPyramid({ showLabels = true }) {
  const cx = W / 2, base = H - 70, levelH = 82;
  const levels = [
    ["Producers", "e.g. grass, algae", "#16a34a", 440, 330],
    ["Primary consumers", "herbivores", "#84cc16", 330, 232],
    ["Secondary consumers", "carnivores", "#f59e0b", 232, 140],
    ["Tertiary consumers", "top predators", "#dc2626", 140, 44],
  ];
  return (
    <g>
      {levels.map(([name, ex, color, wb, wt], i) => {
        const yb = base - i * levelH, yt = yb - levelH;
        return (
          <g key={i} filter="url(#viz-shadow)">
            <path d={`M ${cx - wb / 2} ${yb} L ${cx + wb / 2} ${yb} L ${cx + wt / 2} ${yt} L ${cx - wt / 2} ${yt} Z`} fill={color} stroke="#334155" strokeWidth="1.5" />
            <text x={cx} y={yb - levelH / 2 - 2} fontSize="13" fontWeight="700" fill="#fff" textAnchor="middle">{name}</text>
            {showLabels && <text x={cx} y={yb - levelH / 2 + 15} fontSize="10.5" fill="#f8fafc" textAnchor="middle">{ex}</text>}
          </g>
        );
      })}
      {showLabels && (
        <g>
          <line x1={40} y1={base} x2={40} y2={base - 4 * levelH} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
          <text x={30} y={base - 2 * levelH} fontSize="12" fontWeight="600" fill="#334155" textAnchor="middle" transform={`rotate(-90 30 ${base - 2 * levelH})`}>energy decreases (~10% per level)</text>
        </g>
      )}
    </g>
  );
}

// ---- Kidney (gross anatomy) ------------------------------------------------
export function Kidney({ showLabels = true }) {
  const cx = W / 2 + 10, cy = H / 2;
  const bean = `M ${cx + 150} ${cy - 150} C ${cx + 240} ${cy - 96} ${cx + 240} ${cy + 96} ${cx + 150} ${cy + 150}
    C ${cx + 40} ${cy + 196} ${cx - 90} ${cy + 130} ${cx - 90} ${cy + 44}
    Q ${cx - 40} ${cy} ${cx - 90} ${cy - 44}
    C ${cx - 90} ${cy - 130} ${cx + 40} ${cy - 196} ${cx + 150} ${cy - 150} Z`;
  return (
    <g>
      <path d={bean} fill="#fca5a5" stroke="#b91c1c" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <path d={bean} fill="url(#viz-gloss)" opacity="0.5" />
      {/* Cortex (outer band) */}
      <path d={`M ${cx + 132} ${cy - 128} C ${cx + 196} ${cy - 82} ${cx + 196} ${cy + 82} ${cx + 132} ${cy + 128}`} fill="none" stroke="#f87171" strokeWidth="2" strokeDasharray="4 4" />
      {/* Renal pyramids (medulla) pointing toward the hilum */}
      {[-84, -28, 28, 84].map((dy, i) => (
        <path key={i} d={`M ${cx + 150} ${cy + dy - 26} L ${cx + 20} ${cy + dy} L ${cx + 150} ${cy + dy + 26} Z`} fill="#ef4444" stroke="#991b1b" strokeWidth="1" opacity="0.85" />
      ))}
      {/* Renal pelvis + calyces */}
      <path d={`M ${cx + 20} ${cy - 60} Q ${cx - 30} ${cy} ${cx + 20} ${cy + 60} Q ${cx - 6} ${cy} ${cx + 20} ${cy - 60} Z`} fill="#fef9c3" stroke="#a16207" strokeWidth="2" />
      {/* Ureter */}
      <path d={`M ${cx - 30} ${cy + 6} q -40 60 -30 150`} fill="none" stroke="#eab308" strokeWidth="9" strokeLinecap="round" />
      {/* Renal artery / vein at hilum */}
      <path d={`M ${cx - 60} ${cy - 24} q -60 -6 -96 -30`} stroke="#dc2626" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={`M ${cx - 60} ${cy + 20} q -70 8 -110 34`} stroke="#2563eb" strokeWidth="9" fill="none" strokeLinecap="round" />
      {showLabels && (
        <g>
          <Leader x={cx + 170} y={cy - 90} tx={W - 70} ty={cy - 130} text="Cortex" color="#b91c1c" side="right" />
          <Leader x={cx + 90} y={cy + 28} tx={W - 70} ty={cy + 40} text="Medulla (renal pyramid)" color="#991b1b" side="right" />
          <Leader x={cx + 8} y={cy} tx={W - 70} ty={cy + 140} text="Renal pelvis" color="#a16207" side="right" />
          <Leader x={cx - 156} y={cy - 54} tx={70} ty={cy - 90} text="Renal artery" color="#dc2626" side="left" />
          <Leader x={cx - 168} y={cy + 54} tx={70} ty={cy + 10} text="Renal vein" color="#2563eb" side="left" />
          <Leader x={cx - 56} y={cy + 130} tx={70} ty={cy + 150} text="Ureter" color="#a16207" side="left" />
        </g>
      )}
    </g>
  );
}


// ---- Layers of the Earth ---------------------------------------------------
export function EarthLayers({ showLabels = true }) {
  const cx = W / 2 - 30, cy = H / 2;
  return (
    <g>
      <g filter="url(#viz-shadow)"><circle cx={cx} cy={cy} r={200} fill="#78350f" /></g>
      <circle cx={cx} cy={cy} r={192} fill="#d97706" />
      <circle cx={cx} cy={cy} r={112} fill="#ef4444" />
      <circle cx={cx} cy={cy} r={56} fill="#fbbf24" />
      <circle cx={cx} cy={cy} r={200} fill="url(#viz-gloss)" opacity="0.4" />
      {showLabels && (
        <g>
          <Leader x={cx + 141} y={cy - 141} tx={W - 70} ty={80} text="Crust" color="#78350f" side="right" />
          <Leader x={cx + 150} y={cy - 60} tx={W - 70} ty={cy - 70} text="Mantle" color="#d97706" side="right" />
          <Leader x={cx + 84} y={cy + 40} tx={W - 70} ty={cy + 60} text="Outer core (liquid)" color="#ef4444" side="right" />
          <Leader x={cx} y={cy} tx={70} ty={cy + 150} text="Inner core (solid)" color="#b45309" side="left" />
        </g>
      )}
    </g>
  );
}

// ---- Layers of the atmosphere ----------------------------------------------
export function AtmosphereLayers({ showLabels = true }) {
  const bands = [
    ["Troposphere", "#bae6fd", "0–12 km"], ["Stratosphere", "#7dd3fc", "12–50 km"],
    ["Mesosphere", "#3b82f6", "50–85 km"], ["Thermosphere", "#1e3a8a", "85–600 km"],
    ["Exosphere", "#0f172a", "600+ km"],
  ];
  const top = 40, bottom = H - 46, h = (bottom - top) / bands.length, x0 = 90, x1 = W - 90;
  return (
    <g>
      {bands.map(([name, color, alt], i) => {
        const y = bottom - (i + 1) * h;
        return (
          <g key={i}>
            <rect x={x0} y={y} width={x1 - x0} height={h} fill={color} />
            <text x={x0 + 16} y={y + h / 2 + 2} fontSize="13" fontWeight="700" fill={i >= 2 ? "#f8fafc" : "#0c4a6e"}>{name}</text>
            {showLabels && <text x={x1 - 12} y={y + h / 2 + 2} fontSize="11" fill={i >= 2 ? "#cbd5e1" : "#334155"} textAnchor="end">{alt}</text>}
          </g>
        );
      })}
      {/* Ground */}
      <path d={`M ${x0} ${bottom} Q ${(x0 + x1) / 2} ${bottom - 24} ${x1} ${bottom} L ${x1} ${H - 20} L ${x0} ${H - 20} Z`} fill="#16a34a" stroke="#15803d" strokeWidth="2" />
      {/* A few markers */}
      <circle cx={x0 + 120} cy={bottom - h * 0.5} r="12" fill="#f1f5f9" /><circle cx={x0 + 138} cy={bottom - h * 0.5} r="14" fill="#f1f5f9" />
      <rect x={x0} y={top} width={x1 - x0} height={bottom - top} fill="none" stroke="#334155" strokeWidth="1.5" />
    </g>
  );
}

// ---- Series & parallel circuits --------------------------------------------
function bulb(x, y, color = "#f59e0b") {
  return <g stroke={color} strokeWidth="2.5" fill="none"><circle cx={x} cy={y} r="13" /><line x1={x - 9} y1={y - 9} x2={x + 9} y2={y + 9} /><line x1={x - 9} y1={y + 9} x2={x + 9} y2={y - 9} /></g>;
}
function battery(x, y) {
  return <g stroke="#334155" strokeWidth="3"><line x1={x} y1={y - 14} x2={x} y2={y + 14} /><line x1={x + 8} y1={y - 8} x2={x + 8} y2={y + 8} /></g>;
}
export function Circuits({ showLabels = true }) {
  const wire = "#334155";
  return (
    <g fill="none">
      {/* Series (left) */}
      <text x={175} y={90} fontSize="15" fontWeight="800" fill={wire} textAnchor="middle">Series</text>
      <rect x={70} y={130} width={210} height={230} rx="6" stroke={wire} strokeWidth="2.5" />
      <battery x={70} y={245} />
      {bulb(140, 130)}{bulb(210, 130)}
      {/* Parallel (right) */}
      <text x={575} y={90} fontSize="15" fontWeight="800" fill={wire} textAnchor="middle">Parallel</text>
      <path d="M 480 130 H 690 M 480 360 H 690 M 480 130 V 360 M 690 130 V 360" stroke={wire} strokeWidth="2.5" />
      <path d="M 555 130 V 360 M 620 130 V 360" stroke={wire} strokeWidth="2.5" />
      <battery x={480} y={245} />
      {bulb(555, 245)}{bulb(620, 245)}
      {showLabels && (
        <g fill={wire}>
          <text x={175} y={390} fontSize="11" textAnchor="middle" stroke="none">one path — bulbs share the current</text>
          <text x={575} y={390} fontSize="11" textAnchor="middle" stroke="none">branches — each bulb its own path</text>
        </g>
      )}
    </g>
  );
}

// ---- Transverse & longitudinal waves ---------------------------------------
export function Waves({ showLabels = true }) {
  const left = 80, right = W - 80, midT = 150, amp = 60;
  const pts = [];
  for (let i = 0; i <= 200; i++) { const x = left + (i / 200) * (right - left); pts.push(`${x.toFixed(1)},${(midT - amp * Math.sin((i / 200) * 4 * Math.PI)).toFixed(1)}`); }
  const baseL = 360;
  const lines = [];
  for (let i = 0; i < 46; i++) {
    const t = i / 46; const dense = 0.5 + 0.5 * Math.cos(t * 4 * Math.PI);
    const x = left + t * (right - left) + 10 * Math.sin(t * 4 * Math.PI);
    lines.push(<line key={i} x1={x} y1={baseL - 34} x2={x} y2={baseL + 34} stroke="#0891b2" strokeWidth={1.6 + dense} />);
  }
  return (
    <g>
      {/* Transverse */}
      <text x={W / 2} y={64} fontSize="15" fontWeight="800" fill="#334155" textAnchor="middle">Transverse wave</text>
      <line x1={left - 10} y1={midT} x2={right + 10} y2={midT} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" />
      <polyline points={pts.join(" ")} fill="none" stroke="#2563eb" strokeWidth="3" />
      {showLabels && (
        <g>
          <line x1={left + 25} y1={midT} x2={left + 25} y2={midT - amp} stroke="#ef4444" strokeWidth="2" markerEnd="url(#il-arrow)" />
          <text x={left + 32} y={midT - amp / 2} fontSize="11" fill="#ef4444">amplitude</text>
          <line x1={left + 50} y1={midT - amp - 18} x2={left + 150} y2={midT - amp - 18} stroke="#16a34a" strokeWidth="2" markerStart="url(#il-arrow)" markerEnd="url(#il-arrow)" />
          <text x={left + 100} y={midT - amp - 24} fontSize="11" fill="#16a34a" textAnchor="middle">wavelength</text>
          <text x={W / 2} y={midT + amp + 30} fontSize="10.5" fill="#64748b" textAnchor="middle">particles move ⟂ to wave direction (crests & troughs)</text>
        </g>
      )}
      {/* Longitudinal */}
      <text x={W / 2} y={baseL - 70} fontSize="15" fontWeight="800" fill="#334155" textAnchor="middle">Longitudinal wave</text>
      {lines}
      {showLabels && (
        <g>
          <text x={left + 60} y={baseL + 58} fontSize="11" fill="#0891b2" textAnchor="middle">compression</text>
          <text x={left + 150} y={baseL + 58} fontSize="11" fill="#64748b" textAnchor="middle">rarefaction</text>
          <line x1={right - 150} y1={baseL + 56} x2={right - 30} y2={baseL + 56} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />
          <text x={right - 90} y={baseL + 50} fontSize="10.5" fill="#334155" textAnchor="middle">wave direction</text>
        </g>
      )}
    </g>
  );
}

// ---- Reflex arc ------------------------------------------------------------
export function ReflexArc({ showLabels = true }) {
  const cordX = W / 2, cordY = 120;
  return (
    <g>
      {/* Spinal cord (cross-section) */}
      <ellipse cx={cordX} cy={cordY} rx="70" ry="46" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <path d={`M ${cordX} ${cordY - 26} Q ${cordX - 20} ${cordY} ${cordX} ${cordY + 26} Q ${cordX + 20} ${cordY} ${cordX} ${cordY - 26} Z`} fill="#a5b4fc" />
      {/* Stimulus + receptor (left, hand near flame) */}
      <path d="M 90 430 q 10 -30 30 -20 q -6 -22 16 -18 q 6 -20 22 -6 q 18 -6 10 20 q 20 10 -4 24 Z" fill="#f97316" stroke="#c2410c" strokeWidth="1.5" />
      <ellipse cx={150} cy={400} rx="26" ry="16" fill="#fecaca" stroke="#b91c1c" strokeWidth="1.5" />
      {/* Effector (right, muscle) */}
      <ellipse cx={W - 150} cy={400} rx="40" ry="20" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.5" />
      {/* Sensory neuron: receptor -> cord */}
      <path d={`M 168 392 C 260 340 ${cordX - 60} 220 ${cordX - 26} ${cordY + 34}`} fill="none" stroke="#16a34a" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      {/* Motor neuron: cord -> effector */}
      <path d={`M ${cordX + 26} ${cordY + 34} C ${cordX + 90} 240 ${W - 240} 340 ${W - 178} 392`} fill="none" stroke="#dc2626" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <Leader x={cordX} y={cordY - 44} tx={cordX} ty={44} text="Spinal cord (relay/interneuron)" color="#4f46e5" side="right" />
          <text x={150} y={452} fontSize="12" fontWeight="700" fill="#c2410c" textAnchor="middle">Stimulus + receptor</text>
          <text x={W - 150} y={452} fontSize="12" fontWeight="700" fill="#dc2626" textAnchor="middle">Effector (muscle)</text>
          <text x={240} y={300} fontSize="11" fontWeight="600" fill="#16a34a" textAnchor="middle" transform="rotate(-42 240 300)">sensory neuron</text>
          <text x={W - 240} y={300} fontSize="11" fontWeight="600" fill="#dc2626" textAnchor="middle" transform={`rotate(42 ${W - 240} 300)`}>motor neuron</text>
        </g>
      )}
    </g>
  );
}


// ---- Food chain (illustrated) ----------------------------------------------
export function FoodChain({ showLabels = true }) {
  const y = H / 2, xs = [110, 260, 405, 545, 675];
  const grass = (x) => <g stroke="#16a34a" strokeWidth="3" fill="none" strokeLinecap="round">{[-10, -3, 4, 11].map((o, i) => <path key={i} d={`M ${x + o} ${y + 20} q ${o < 0 ? -6 : 6} -22 ${o < 0 ? -2 : 2} -34`} />)}</g>;
  const hopper = (x) => <g><ellipse cx={x} cy={y} rx="20" ry="9" fill="#84cc16" stroke="#4d7c0f" strokeWidth="1.4" /><circle cx={x + 16} cy={y - 3} r="6" fill="#65a30d" /><line x1={x - 6} y1={y + 6} x2={x - 14} y2={y + 20} stroke="#4d7c0f" strokeWidth="2" /><line x1={x + 2} y1={y + 6} x2={x - 2} y2={y + 22} stroke="#4d7c0f" strokeWidth="2" /></g>;
  const snake = (x) => <g fill="none" stroke="#22c55e" strokeWidth="7" strokeLinecap="round"><path d={`M ${x - 24} ${y + 10} q 12 -20 24 0 q 12 20 24 0`} /><circle cx={x + 26} cy={y + 6} r="4" fill="#15803d" /></g>;
  const eagle = (x) => <g><ellipse cx={x} cy={y} rx="7" ry="16" fill="#78350f" /><path d={`M ${x} ${y - 6} Q ${x - 30} ${y - 26} ${x - 40} ${y - 8}`} fill="none" stroke="#92400e" strokeWidth="5" strokeLinecap="round" /><path d={`M ${x} ${y - 6} Q ${x + 30} ${y - 26} ${x + 40} ${y - 8}`} fill="none" stroke="#92400e" strokeWidth="5" strokeLinecap="round" /><circle cx={x} cy={y - 16} r="6" fill="#a16207" /></g>;
  const items = [
    [grass, "Grass", "Producer", "#16a34a"], [hopper, "Grasshopper", "Primary consumer", "#65a30d"],
    [(x) => iFrog(x, y), "Frog", "Secondary consumer", "#16a34a"], [snake, "Snake", "Tertiary consumer", "#22c55e"],
    [eagle, "Eagle", "Apex predator", "#78350f"],
  ];
  return (
    <g>
      <g filter="url(#viz-shadow)"><Sphere cx={70} cy={70} r={26} fill="#fbbf24" /></g>
      <text x={70} y={112} fontSize="10.5" fill="#f59e0b" textAnchor="middle">Sun</text>
      <line x1={70} y1={98} x2={xs[0]} y2={y - 40} stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="4 4" markerEnd="url(#il-arrow)" />
      {items.map(([draw, name, role, color], i) => (
        <g key={i}>
          {draw(xs[i])}
          {showLabels && <><text x={xs[i]} y={y + 46} fontSize="12.5" fontWeight="700" fill={color} textAnchor="middle">{name}</text>
            <text x={xs[i]} y={y + 62} fontSize="10" fill="#64748b" textAnchor="middle">{role}</text></>}
          {i < items.length - 1 && <line x1={xs[i] + 44} y1={y} x2={xs[i + 1] - 44} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />}
        </g>
      ))}
      {showLabels && <text x={W / 2} y={H - 26} fontSize="11" fill="#64748b" textAnchor="middle">arrows point in the direction energy flows (eaten by →)</text>}
    </g>
  );
}

// ---- Levers (three classes) ------------------------------------------------
export function Levers({ showLabels = true }) {
  const rows = [
    ["Class 1", "fulcrum in the middle (see-saw, scissors)", 0.5, "F centre"],
    ["Class 2", "load in the middle (wheelbarrow)", 0.15, "load centre"],
    ["Class 3", "effort in the middle (tweezers, forearm)", 0.85, "effort centre"],
  ];
  const left = 150, right = W - 120, ys = [120, 270, 420];
  return (
    <g>
      {rows.map(([cls, desc, fpos], r) => {
        const y = ys[r], fx = left + fpos * (right - left);
        const load = r === 1 ? fx : left, effort = r === 2 ? fx : right;
        return (
          <g key={r}>
            <line x1={left} y1={y} x2={right} y2={y} stroke="#a16207" strokeWidth="8" strokeLinecap="round" />
            <path d={`M ${fx - 16} ${y + 30} L ${fx} ${y + 6} L ${fx + 16} ${y + 30} Z`} fill="#334155" />
            {/* load block */}
            <rect x={load - 18} y={y - 34} width="36" height="26" rx="4" fill="#2563eb" />
            <text x={load} y={y - 16} fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">L</text>
            {/* effort arrow */}
            <line x1={effort} y1={y - 44} x2={effort} y2={y - 8} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
            {showLabels && (
              <g>
                <text x={left - 12} y={y + 4} fontSize="13" fontWeight="800" fill="#334155" textAnchor="end">{cls}</text>
                <text x={fx} y={y + 46} fontSize="10" fill="#334155" textAnchor="middle">fulcrum</text>
                <text x={right + 6} y={y + 4} fontSize="10.5" fill="#64748b">{desc}</text>
              </g>
            )}
          </g>
        );
      })}
      {showLabels && <text x={W / 2} y={30} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Classes of levers — L = load · red arrow = effort</text>}
    </g>
  );
}

// ---- Solar & lunar eclipse -------------------------------------------------
export function Eclipse({ showLabels = true }) {
  const sun = (cx, cy, r) => <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={r} fill="#fbbf24" /></g>;
  return (
    <g>
      {/* Solar eclipse (top): Sun - Moon - Earth */}
      {sun(80, 150, 40)}
      <circle cx={380} cy={150} r={14} fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
      <g filter="url(#viz-shadow)"><Sphere cx={560} cy={150} r={40} fill="#2563eb" /></g>
      <path d={`M 380 138 L 548 128 L 548 172 L 380 162 Z`} fill="#334155" opacity="0.28" />
      {showLabels && (
        <g>
          <text x={80} y={206} fontSize="11" fontWeight="700" fill="#f59e0b" textAnchor="middle">Sun</text>
          <text x={380} y={186} fontSize="11" fontWeight="700" fill="#475569" textAnchor="middle">Moon</text>
          <text x={560} y={206} fontSize="11" fontWeight="700" fill="#2563eb" textAnchor="middle">Earth</text>
          <text x={W / 2} y={64} fontSize="13" fontWeight="800" fill="#334155" textAnchor="middle">Solar eclipse — Moon between Sun & Earth</text>
        </g>
      )}
      {/* Lunar eclipse (bottom): Sun - Earth - Moon */}
      {sun(80, 390, 40)}
      <g filter="url(#viz-shadow)"><Sphere cx={400} cy={390} r={34} fill="#2563eb" /></g>
      <circle cx={640} cy={390} r={16} fill="#7f1d1d" stroke="#450a0a" strokeWidth="1.5" />
      <path d={`M 400 366 L 660 356 L 660 424 L 400 414 Z`} fill="#334155" opacity="0.28" />
      {showLabels && (
        <g>
          <text x={80} y={446} fontSize="11" fontWeight="700" fill="#f59e0b" textAnchor="middle">Sun</text>
          <text x={400} y={442} fontSize="11" fontWeight="700" fill="#2563eb" textAnchor="middle">Earth</text>
          <text x={640} y={430} fontSize="11" fontWeight="700" fill="#7f1d1d" textAnchor="middle">Moon</text>
          <text x={W / 2} y={310} fontSize="13" fontWeight="800" fill="#334155" textAnchor="middle">Lunar eclipse — Earth between Sun & Moon</text>
        </g>
      )}
    </g>
  );
}

// ---- Greenhouse effect -----------------------------------------------------
export function GreenhouseEffect({ showLabels = true }) {
  const ground = H - 70, ghgY = 200;
  return (
    <g>
      {/* Space + sun */}
      <g filter="url(#viz-shadow)"><Sphere cx={90} cy={70} r={30} fill="#fbbf24" /></g>
      {/* Greenhouse-gas layer */}
      <rect x={40} y={ghgY - 22} width={W - 80} height="44" rx="18" fill="#bfdbfe" opacity="0.6" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="6 5" />
      {/* Ground */}
      <path d={`M 40 ${ground} Q ${W / 2} ${ground - 22} ${W - 40} ${ground} L ${W - 40} ${H - 20} L 40 ${H - 20} Z`} fill="#16a34a" stroke="#15803d" strokeWidth="2" />
      {/* Incoming solar (yellow) */}
      <line x1={120} y1={100} x2={300} y2={ground - 10} stroke="#f59e0b" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      {/* Reflected out (yellow, escapes) */}
      <line x1={330} y1={ground - 10} x2={470} y2={70} stroke="#f59e0b" strokeWidth="3" markerEnd="url(#il-arrow)" strokeDasharray="5 4" />
      {/* Re-emitted heat (red) up to GHG then trapped back down */}
      <line x1={430} y1={ground - 10} x2={470} y2={ghgY + 12} stroke="#dc2626" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      <line x1={500} y1={ghgY + 12} x2={560} y2={ground - 10} stroke="#dc2626" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={150} y={140} fontSize="11" fontWeight="600" fill="#f59e0b">incoming solar</text>
          <text x={470} y={60} fontSize="11" fontWeight="600" fill="#f59e0b" textAnchor="middle">reflected</text>
          <text x={W - 60} y={ghgY - 28} fontSize="12" fontWeight="700" fill="#2563eb" textAnchor="end">Greenhouse gases</text>
          <text x={560} y={ground - 30} fontSize="11" fontWeight="600" fill="#dc2626">trapped heat</text>
          <text x={W / 2} y={H - 26} fontSize="11" fill="#64748b" textAnchor="middle">greenhouse gases re-radiate heat back to the surface, warming the Earth</text>
        </g>
      )}
    </g>
  );
}

// ---- Seed structure (bean, longitudinal) -----------------------------------
export function SeedStructure({ showLabels = true }) {
  const cx = W / 2 - 20, cy = H / 2;
  const bean = `M ${cx + 150} ${cy - 120} C ${cx + 230} ${cy - 80} ${cx + 230} ${cy + 80} ${cx + 150} ${cy + 120}
    C ${cx + 40} ${cy + 150} ${cx - 120} ${cy + 90} ${cx - 120} ${cy + 30}
    Q ${cx - 150} ${cy} ${cx - 120} ${cy - 30}
    C ${cx - 120} ${cy - 90} ${cx + 40} ${cy - 150} ${cx + 150} ${cy - 120} Z`;
  return (
    <g>
      {/* Testa (seed coat) */}
      <path d={bean} fill="#fbbf24" stroke="#b45309" strokeWidth="3" filter="url(#viz-shadow)" />
      <path d={bean} fill="url(#viz-gloss)" opacity="0.4" />
      {/* Cotyledon (food store) */}
      <path d={`M ${cx + 140} ${cy - 96} C ${cx + 200} ${cy - 60} ${cx + 200} ${cy + 60} ${cx + 140} ${cy + 96} C ${cx + 40} ${cy + 120} ${cx - 80} ${cy + 60} ${cx - 80} ${cy} C ${cx - 80} ${cy - 60} ${cx + 40} ${cy - 120} ${cx + 140} ${cy - 96} Z`} fill="#fde68a" stroke="#ca8a04" strokeWidth="1.5" />
      {/* Embryo: radicle (root) + plumule (shoot) near the hilum side */}
      <path d={`M ${cx - 78} ${cy} q -30 -6 -50 -22`} fill="none" stroke="#16a34a" strokeWidth="6" strokeLinecap="round" />
      <path d={`M ${cx - 78} ${cy + 6} q -34 6 -54 26`} fill="none" stroke="#65a30d" strokeWidth="5" strokeLinecap="round" />
      {[-4, 0, 4].map((o, i) => <path key={i} d={`M ${cx - 120} ${cy - 20 + o} q -14 -6 -22 ${o}`} fill="none" stroke="#16a34a" strokeWidth="2" />)}
      {/* Hilum */}
      <ellipse cx={cx - 128} cy={cy} rx="6" ry="12" fill="#78350f" />
      {showLabels && (
        <g>
          <Leader x={cx + 170} y={cy - 90} tx={W - 70} ty={cy - 130} text="Testa (seed coat)" color="#b45309" side="right" />
          <Leader x={cx + 60} y={cy - 40} tx={W - 70} ty={cy - 20} text="Cotyledon (food store)" color="#ca8a04" side="right" />
          <Leader x={cx - 140} y={cy - 24} tx={70} ty={cy - 90} text="Plumule (shoot)" color="#16a34a" side="left" />
          <Leader x={cx - 140} y={cy + 24} tx={70} ty={cy + 60} text="Radicle (root)" color="#65a30d" side="left" />
          <Leader x={cx - 128} y={cy} tx={70} ty={cy - 20} text="Hilum" color="#78350f" side="left" />
        </g>
      )}
    </g>
  );
}


// ---- Punnett square (monohybrid cross) -------------------------------------
export function PunnettSquare({ showLabels = true }) {
  const top = ["B", "b"], side = ["B", "b"], cell = 116, cx = W / 2;
  const gx = cx - cell, gy = 168;
  const geno = (a, b) => (a === "B" || b === "B" ? (a === "B" && b === "B" ? "BB" : "Bb") : "bb");
  return (
    <g>
      {top.map((t, c) => <text key={`t${c}`} x={gx + c * cell + cell / 2} y={gy - 14} fontSize="22" fontWeight="800" fill="#2563eb" textAnchor="middle">{t}</text>)}
      {side.map((s, r) => <text key={`s${r}`} x={gx - 20} y={gy + r * cell + cell / 2 + 8} fontSize="22" fontWeight="800" fill="#dc2626" textAnchor="middle">{s}</text>)}
      {side.map((s, r) => top.map((t, c) => {
        const g = geno(t, s), dom = g.includes("B");
        return (
          <g key={`${r}-${c}`}>
            <rect x={gx + c * cell} y={gy + r * cell} width={cell} height={cell} fill={dom ? "#bbf7d0" : "#fde68a"} stroke="#334155" strokeWidth="2" />
            <text x={gx + c * cell + cell / 2} y={gy + r * cell + cell / 2 + 8} fontSize="26" fontWeight="800" fill={dom ? "#15803d" : "#a16207"} textAnchor="middle">{g}</text>
          </g>
        );
      }))}
      {showLabels && (
        <g>
          <text x={cx} y={104} fontSize="14" fontWeight="700" fill="#2563eb" textAnchor="middle">Parent 1 gametes (Bb)</text>
          <text x={54} y={gy + cell} fontSize="14" fontWeight="700" fill="#dc2626" textAnchor="middle" transform={`rotate(-90 54 ${gy + cell})`}>Parent 2 gametes (Bb)</text>
          <text x={cx} y={gy + 2 * cell + 40} fontSize="14" fontWeight="700" fill="#334155" textAnchor="middle">Offspring ratio — 3 dominant : 1 recessive (genotype 1 BB : 2 Bb : 1 bb)</text>
        </g>
      )}
    </g>
  );
}

// ---- Plate tectonics (boundary types) --------------------------------------
export function PlateTectonics({ showLabels = true }) {
  const rows = [["Divergent", 110], ["Convergent", 270], ["Transform", 430]];
  const brown = "#a16207", brownD = "#78350f", cx = W / 2;
  return (
    <g>
      {rows.map(([type, y], i) => (
        <g key={i}>
          <text x={70} y={y} fontSize="13" fontWeight="800" fill="#334155">{type}</text>
          {type === "Divergent" && (
            <g>
              <rect x={200} y={y - 24} width="150" height="48" fill={brown} stroke={brownD} strokeWidth="1.5" />
              <rect x={cx + 60} y={y - 24} width="150" height="48" fill={brown} stroke={brownD} strokeWidth="1.5" />
              <path d={`M ${cx} ${y + 40} L ${cx - 18} ${y - 6} L ${cx + 18} ${y - 6} Z`} fill="#ef4444" />
              <line x1={190} y1={y} x2={130} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
              <line x1={cx + 220} y1={y} x2={W - 70} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
              {showLabels && <text x={cx} y={y + 56} fontSize="10" fill="#dc2626" textAnchor="middle">magma rises (mid-ocean ridge)</text>}
            </g>
          )}
          {type === "Convergent" && (
            <g>
              <rect x={180} y={y - 24} width="200" height="48" fill={brown} stroke={brownD} strokeWidth="1.5" />
              <path d={`M ${cx + 30} ${y - 24} L ${W - 120} ${y - 24} L ${W - 120} ${y + 24} L ${cx + 70} ${y + 24} Z`} fill={brown} stroke={brownD} strokeWidth="1.5" transform={`rotate(12 ${cx + 60} ${y})`} />
              <path d={`M ${cx - 40} ${y - 24} L ${cx - 20} ${y - 46} L ${cx} ${y - 24} Z`} fill="#92400e" />
              <line x1={cx - 90} y1={y} x2={cx - 30} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
              <line x1={W - 80} y1={y} x2={cx + 90} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
              {showLabels && <text x={cx - 20} y={y - 52} fontSize="10" fill="#92400e" textAnchor="middle">mountains / subduction</text>}
            </g>
          )}
          {type === "Transform" && (
            <g>
              <rect x={180} y={y - 26} width={cx - 180} height="24" fill={brown} stroke={brownD} strokeWidth="1.5" />
              <rect x={cx} y={y + 2} width={W - 120 - cx} height="24" fill={brown} stroke={brownD} strokeWidth="1.5" />
              <line x1={220} y1={y - 38} x2={cx - 40} y2={y - 38} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
              <line x1={W - 120} y1={y + 40} x2={cx + 40} y2={y + 40} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
              {showLabels && <text x={cx} y={y + 56} fontSize="10" fill="#334155" textAnchor="middle">plates slide past each other (fault)</text>}
            </g>
          )}
        </g>
      ))}
    </g>
  );
}

// ---- Simple machines: pulley & inclined plane ------------------------------
export function SimpleMachines({ showLabels = true }) {
  return (
    <g>
      {/* Fixed pulley (left) */}
      <text x={200} y={80} fontSize="15" fontWeight="800" fill="#334155" textAnchor="middle">Fixed pulley</text>
      <line x1={120} y1={110} x2={280} y2={110} stroke="#334155" strokeWidth="5" />
      <g filter="url(#viz-shadow)"><Sphere cx={200} cy={150} r={34} fill="#94a3b8" /></g>
      <circle cx={200} cy={150} r={6} fill="#475569" />
      <path d="M 168 150 V 300" stroke="#334155" strokeWidth="3" fill="none" />
      <path d="M 232 150 V 260" stroke="#dc2626" strokeWidth="3" fill="none" />
      <rect x={148} y={300} width="44" height="40" rx="4" fill="#2563eb" /><text x={170} y={325} fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">L</text>
      <line x1={232} y1={264} x2={232} y2={300} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* Inclined plane (right) */}
      <text x={560} y={80} fontSize="15" fontWeight="800" fill="#334155" textAnchor="middle">Inclined plane</text>
      <path d="M 440 360 L 700 360 L 440 180 Z" fill="#e2e8f0" stroke="#64748b" strokeWidth="2" filter="url(#viz-shadow)" />
      <rect x={520} y={252} width="46" height="40" rx="4" fill="#2563eb" transform="rotate(-35 543 272)" /><text x={543} y={276} fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle" transform="rotate(-35 543 272)">L</text>
      <line x1={600} y1={300} x2={470} y2={210} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={170} y={332} fontSize="10" fill="#fff" textAnchor="middle" />
          <text x={250} y={264} fontSize="11" fill="#dc2626">effort</text>
          <text x={150} y={356} fontSize="11" fill="#2563eb" textAnchor="middle">load</text>
          <text x={560} y={340} fontSize="11" fill="#dc2626">effort ↑ ramp</text>
          <text x={438} y={270} fontSize="11" fill="#64748b" textAnchor="end">height</text>
        </g>
      )}
    </g>
  );
}

// ---- Ionic vs covalent bonding ---------------------------------------------
function shellAtom(x, y, sym, electrons, color) {
  return (
    <g>
      <circle cx={x} cy={y} r="44" fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 3" />
      <g filter="url(#viz-shadow)"><Sphere cx={x} cy={y} r={22} fill={color} /></g>
      <text x={x} y={y + 5} fontSize="15" fontWeight="800" fill="#fff" textAnchor="middle">{sym}</text>
      {Array.from({ length: electrons }).map((_, i) => { const a = -Math.PI / 2 + (i / electrons) * 2 * Math.PI; return <circle key={i} cx={x + 44 * Math.cos(a)} cy={y + 44 * Math.sin(a)} r="4.5" fill="#1e293b" />; })}
    </g>
  );
}
export function Bonding({ showLabels = true }) {
  const y = H / 2;
  return (
    <g>
      {/* Ionic (left) */}
      <text x={210} y={90} fontSize="15" fontWeight="800" fill="#334155" textAnchor="middle">Ionic (electron transfer)</text>
      {shellAtom(130, y, "Na", 1, "#8b5cf6")}
      {shellAtom(300, y, "Cl", 7, "#10b981")}
      <line x1={176} y1={y - 30} x2={258} y2={y - 30} stroke="#dc2626" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={216} y={y - 40} fontSize="10.5" fill="#dc2626" textAnchor="middle">e⁻ transfer</text>
          <text x={130} y={y + 78} fontSize="13" fontWeight="700" fill="#8b5cf6" textAnchor="middle">Na⁺</text>
          <text x={300} y={y + 78} fontSize="13" fontWeight="700" fill="#10b981" textAnchor="middle">Cl⁻</text>
        </g>
      )}
      {/* Covalent (right) */}
      <text x={560} y={90} fontSize="15" fontWeight="800" fill="#334155" textAnchor="middle">Covalent (shared pair)</text>
      {shellAtom(500, y, "Cl", 6, "#10b981")}
      {shellAtom(620, y, "Cl", 6, "#10b981")}
      <circle cx={560} cy={y - 6} r="4.5" fill="#dc2626" /><circle cx={560} cy={y + 6} r="4.5" fill="#dc2626" />
      {showLabels && <text x={560} y={y + 78} fontSize="12" fontWeight="700" fill="#dc2626" textAnchor="middle">shared pair (Cl₂)</text>}
    </g>
  );
}

// ---- Star life cycle -------------------------------------------------------
export function StarLifeCycle({ showLabels = true }) {
  const arrow = (x1, y1, x2, y2, k) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />;
  const node = (x, y, r, fill, label, sub) => (
    <g>
      <g filter="url(#viz-shadow)"><Sphere cx={x} cy={y} r={r} fill={fill} /></g>
      {showLabels && <text x={x} y={y + r + 16} fontSize="11" fontWeight="700" fill="currentColor" textAnchor="middle">{label}</text>}
      {showLabels && sub && <text x={x} y={y + r + 30} fontSize="9.5" fill="#64748b" textAnchor="middle">{sub}</text>}
    </g>
  );
  const midY = 170;
  return (
    <g>
      {/* Start: nebula -> protostar -> main-sequence star */}
      <text x={100} y={midY - 44} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">Nebula</text>
      {[[-14, -8], [8, -12], [18, 6], [-6, 10], [0, 0]].map(([dx, dy], i) => <circle key={i} cx={100 + dx * 2.2} cy={midY + dy * 2.2} r="16" fill="#a78bfa" opacity="0.6" />)}
      {arrow(150, midY, 190, midY, "a1")}
      {node(230, midY, 16, "#f59e0b", "Protostar")}
      {arrow(262, midY, 300, midY, "a2")}
      {node(345, midY, 22, "#fbbf24", "Main-sequence star", "(e.g. Sun)")}
      {/* Branch up: low mass */}
      {arrow(378, midY - 10, 430, 90, "a3")}
      {node(480, 90, 30, "#f97316", "Red giant")}
      {arrow(516, 90, 560, 90, "a4")}
      {node(600, 90, 12, "#f8fafc", "White dwarf")}
      {/* Branch down: high mass */}
      {arrow(378, midY + 10, 430, 300, "a5")}
      {node(485, 300, 36, "#ef4444", "Red supergiant")}
      {arrow(525, 300, 565, 300, "a6")}
      {node(600, 300, 20, "#fde68a", "Supernova")}
      {arrow(624, 300, 664, 300, "a7")}
      {node(700, 300, 12, "#0f172a", "Black hole / neutron star")}
      {showLabels && (
        <g>
          <text x={410} y={60} fontSize="10.5" fill="#64748b">low-mass star →</text>
          <text x={410} y={360} fontSize="10.5" fill="#64748b">high-mass star →</text>
        </g>
      )}
    </g>
  );
}


// ---- Types of joints -------------------------------------------------------
export function Joints({ showLabels = true }) {
  const bone = "#e5e7eb", boneD = "#94a3b8", y = 220;
  const cols = [175, 400, 620];
  return (
    <g stroke={boneD} strokeWidth="0.6">
      {/* Hinge */}
      <g>
        <line x1={cols[0]} y1={y - 90} x2={cols[0]} y2={y} stroke={bone} strokeWidth="16" strokeLinecap="round" />
        <line x1={cols[0]} y1={y} x2={cols[0] + 70} y2={y + 60} stroke={bone} strokeWidth="16" strokeLinecap="round" />
        <circle cx={cols[0]} cy={y} r="10" fill="#fca5a5" />
        <path d={`M ${cols[0] + 30} ${y + 26} A 40 40 0 0 0 ${cols[0] + 44} ${y - 10}`} fill="none" stroke="#dc2626" strokeWidth="2" markerEnd="url(#il-arrow)" />
      </g>
      {/* Ball & socket */}
      <g>
        <path d={`M ${cols[1] - 30} ${y - 40} A 40 40 0 1 0 ${cols[1] - 30} ${y + 40}`} fill="none" stroke={bone} strokeWidth="16" />
        <line x1={cols[1] + 30} y1={y} x2={cols[1] + 90} y2={y + 60} stroke={bone} strokeWidth="16" strokeLinecap="round" />
        <Sphere cx={cols[1]} cy={y} r={22} fill="#fca5a5" />
        <path d={`M ${cols[1] + 34} ${y - 30} A 30 30 0 1 1 ${cols[1] + 30} ${y - 34}`} fill="none" stroke="#dc2626" strokeWidth="2" markerEnd="url(#il-arrow)" />
      </g>
      {/* Pivot */}
      <g>
        <line x1={cols[2] - 50} y1={y} x2={cols[2] + 50} y2={y} stroke={bone} strokeWidth="16" strokeLinecap="round" />
        <circle cx={cols[2]} cy={y} r="16" fill="none" stroke={bone} strokeWidth="8" />
        <line x1={cols[2]} y1={y - 70} x2={cols[2]} y2={y + 10} stroke="#cbd5e1" strokeWidth="10" strokeLinecap="round" />
        <path d={`M ${cols[2] - 26} ${y - 40} A 26 26 0 0 1 ${cols[2] + 26} ${y - 40}`} fill="none" stroke="#dc2626" strokeWidth="2" markerEnd="url(#il-arrow)" />
      </g>
      {showLabels && (
        <g stroke="none">
          <text x={cols[0]} y={y + 96} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Hinge</text>
          <text x={cols[0]} y={y + 112} fontSize="10" fill="#64748b" textAnchor="middle">elbow, knee</text>
          <text x={cols[1]} y={y + 96} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Ball & socket</text>
          <text x={cols[1]} y={y + 112} fontSize="10" fill="#64748b" textAnchor="middle">hip, shoulder</text>
          <text x={cols[2]} y={y + 96} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Pivot</text>
          <text x={cols[2]} y={y + 112} fontSize="10" fill="#64748b" textAnchor="middle">neck (atlas–axis)</text>
        </g>
      )}
    </g>
  );
}

// ---- Skin (cross-section) --------------------------------------------------
export function SkinSection({ showLabels = true }) {
  const x0 = 150, x1 = 590, top = 100;
  const epiY = top, derY = top + 60, hypY = top + 200, bottom = top + 320;
  return (
    <g>
      <rect x={x0} y={epiY} width={x1 - x0} height={derY - epiY} fill="#fcd9b6" stroke="#d97706" strokeWidth="1.5" />
      <rect x={x0} y={derY} width={x1 - x0} height={hypY - derY} fill="#fecdd3" stroke="#e11d48" strokeWidth="1.5" />
      <rect x={x0} y={hypY} width={x1 - x0} height={bottom - hypY} fill="#fef9c3" stroke="#ca8a04" strokeWidth="1.5" />
      {[...Array(6)].map((_, i) => <circle key={i} cx={x0 + 50 + i * 80} cy={hypY + 55} r="26" fill="#fde68a" stroke="#ca8a04" strokeWidth="1" />)}
      {/* Hair + follicle */}
      <line x1={x0 + 130} y1={epiY} x2={x0 + 110} y2={epiY - 46} stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
      <path d={`M ${x0 + 130} ${epiY} L ${x0 + 150} ${hypY + 20}`} stroke="#78350f" strokeWidth="6" fill="none" />
      <ellipse cx={x0 + 150} cy={hypY + 26} rx="10" ry="16" fill="#92400e" />
      {/* Sweat gland (coiled) + duct */}
      <path d={`M ${x0 + 300} ${epiY} L ${x0 + 310} ${hypY - 10}`} stroke="#0ea5e9" strokeWidth="3" fill="none" />
      <circle cx={x0 + 312} cy={hypY - 2} r="16" fill="none" stroke="#0284c7" strokeWidth="3" />
      {/* Blood vessel */}
      <path d={`M ${x0 + 400} ${derY + 20} q 20 30 -6 60 q -26 30 6 60`} fill="none" stroke="#dc2626" strokeWidth="3" />
      {showLabels && (
        <g>
          <Leader x={x1} y={(epiY + derY) / 2} tx={W - 60} ty={epiY + 6} text="Epidermis" color="#d97706" side="right" />
          <Leader x={x1} y={(derY + hypY) / 2} tx={W - 60} ty={(derY + hypY) / 2} text="Dermis" color="#e11d48" side="right" />
          <Leader x={x1} y={(hypY + bottom) / 2} tx={W - 60} ty={(hypY + bottom) / 2} text="Hypodermis (fat)" color="#ca8a04" side="right" />
          <Leader x={x0 + 110} y={epiY - 40} tx={70} ty={top - 6} text="Hair" color="#78350f" side="left" />
          <Leader x={x0 + 150} y={hypY + 26} tx={70} ty={hypY + 40} text="Hair follicle" color="#92400e" side="left" />
          <Leader x={x0 + 312} y={hypY - 2} tx={70} ty={hypY - 20} text="Sweat gland" color="#0284c7" side="left" />
          <Leader x={x0 + 400} y={derY + 60} tx={70} ty={derY + 80} text="Blood vessel" color="#dc2626" side="left" />
        </g>
      )}
    </g>
  );
}

// ---- Reflection & refraction of light --------------------------------------
export function ReflectionRefraction({ showLabels = true }) {
  return (
    <g>
      {/* Reflection (left) */}
      <text x={200} y={70} fontSize="15" fontWeight="800" fill="#334155" textAnchor="middle">Reflection</text>
      <line x1={70} y1={330} x2={330} y2={330} stroke="#334155" strokeWidth="4" />
      {[...Array(9)].map((_, i) => <line key={i} x1={80 + i * 28} y1={330} x2={72 + i * 28} y2={344} stroke="#94a3b8" strokeWidth="1.5" />)}
      <line x1={200} y1={330} x2={200} y2={140} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" />
      <line x1={90} y1={170} x2={200} y2={330} stroke="#f59e0b" strokeWidth="3" markerEnd="url(#il-arrow)" />
      <line x1={200} y1={330} x2={310} y2={170} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={130} y={230} fontSize="10.5" fill="#f59e0b">incident</text>
          <text x={270} y={230} fontSize="10.5" fill="#dc2626" textAnchor="end">reflected</text>
          <text x={206} y={160} fontSize="10" fill="#64748b">normal</text>
          <text x={200} y={362} fontSize="10.5" fill="#334155" textAnchor="middle">angle in = angle out</text>
        </g>
      )}
      {/* Refraction (right) */}
      <text x={560} y={70} fontSize="15" fontWeight="800" fill="#334155" textAnchor="middle">Refraction</text>
      <rect x={430} y={250} width={260} height={130} fill="#bae6fd" opacity="0.6" />
      <line x1={430} y1={250} x2={690} y2={250} stroke="#0284c7" strokeWidth="3" />
      <line x1={560} y1={130} x2={560} y2={370} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" />
      <line x1={450} y1={150} x2={560} y2={250} stroke="#f59e0b" strokeWidth="3" markerEnd="url(#il-arrow)" />
      <line x1={560} y1={250} x2={620} y2={360} stroke="#f59e0b" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={470} y={210} fontSize="10.5" fill="#f59e0b">incident (air)</text>
          <text x={596} y={330} fontSize="10.5" fill="#f59e0b">refracted (water)</text>
          <text x={636} y={244} fontSize="10.5" fill="#0284c7" textAnchor="end">bends toward normal</text>
        </g>
      )}
    </g>
  );
}

// ---- Protein synthesis (DNA → RNA → protein) -------------------------------
export function ProteinSynthesis({ showLabels = true }) {
  const y = H / 2 - 20;
  const dnaPts = (yy, ph) => { const a = []; for (let i = 0; i <= 40; i++) { const x = 70 + i * 3; a.push(`${x},${(yy + 16 * Math.sin(i / 40 * 3 * Math.PI + ph)).toFixed(1)}`); } return a.join(" "); };
  return (
    <g>
      {/* DNA */}
      <polyline points={dnaPts(y, 0)} fill="none" stroke="#2563eb" strokeWidth="3.5" />
      <polyline points={dnaPts(y, Math.PI)} fill="none" stroke="#7c3aed" strokeWidth="3.5" />
      <text x={130} y={y + 60} fontSize="12" fontWeight="700" fill="#4338ca" textAnchor="middle">DNA</text>
      {/* transcription arrow */}
      <line x1={200} y1={y} x2={280} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <text x={240} y={y - 10} fontSize="11" fontWeight="600" fill="#16a34a" textAnchor="middle">transcription</text>
      {/* mRNA (single wavy strand) */}
      <polyline points={Array.from({ length: 41 }, (_, i) => `${300 + i * 2.6},${(y + 14 * Math.sin((i / 40) * 3 * Math.PI)).toFixed(1)}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="3.5" />
      <text x={352} y={y + 60} fontSize="12" fontWeight="700" fill="#b45309" textAnchor="middle">mRNA</text>
      {/* ribosome + translation */}
      <line x1={430} y1={y} x2={510} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <text x={470} y={y - 10} fontSize="11" fontWeight="600" fill="#16a34a" textAnchor="middle">translation</text>
      <g filter="url(#viz-shadow)"><ellipse cx={545} cy={y} rx="30" ry="22" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" /><ellipse cx={545} cy={y - 8} rx="30" ry="12" fill="#94a3b8" /></g>
      <text x={545} y={y + 44} fontSize="11" fill="#475569" textAnchor="middle">ribosome</text>
      {/* Protein chain */}
      {[0, 1, 2, 3, 4].map((i) => <Sphere key={i} cx={610 + i * 26} cy={y - 30 + (i % 2) * 16} r={11} fill={PALETTE[i % PALETTE.length]} />)}
      <text x={670} y={y + 30} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">protein</text>
    </g>
  );
}

// ---- Oxygen cycle ----------------------------------------------------------
export function OxygenCycle({ showLabels = true }) {
  const cx = W / 2;
  const atm = [cx, 74], plants = [180, 300], animals = [W - 180, 300], comb = [cx, 440];
  return (
    <g>
      <CurveArrow a={[plants[0], plants[1] - 26]} b={[atm[0] - 60, atm[1] + 24]} label="photosynthesis (O₂ out)" color="#16a34a" k="o1" bow={-0.16} />
      <CurveArrow a={[atm[0] + 60, atm[1] + 24]} b={[animals[0], animals[1] - 26]} label="respiration (O₂ in)" color="#dc2626" k="o2" bow={-0.16} />
      <CurveArrow a={[animals[0] - 60, animals[1] + 20]} b={[plants[0] + 60, plants[1] + 20]} label="CO₂ to plants" color="#334155" k="o3" bow={0.14} />
      <CurveArrow a={[comb[0], comb[1] - 26]} b={[atm[0], atm[1] + 26]} label="" color="#334155" k="o4" bow={0.32} />
      <CycleBox x={atm[0]} y={atm[1]} color="#0ea5e9" text="Atmospheric O₂" w={170} />
      <CycleBox x={plants[0]} y={plants[1]} color="#16a34a" text="Plants" w={130} />
      <CycleBox x={animals[0]} y={animals[1]} color="#b45309" text="Animals" w={130} />
      <CycleBox x={comb[0]} y={comb[1]} color="#334155" text="Combustion (uses O₂)" w={200} />
    </g>
  );
}


// ---- Soil horizons ---------------------------------------------------------
export function SoilHorizons({ showLabels = true }) {
  const x0 = 150, x1 = 560, layers = [
    ["O — Humus / litter", "#3f2d1a", 56], ["A — Topsoil", "#7c4a1e", 78],
    ["B — Subsoil", "#b45309", 96], ["C — Parent material", "#a8a29e", 96], ["R — Bedrock", "#64748b", 88],
  ];
  let y = 70;
  return (
    <g>
      {/* grass on top */}
      {[...Array(9)].map((_, i) => <path key={i} d={`M ${x0 + 20 + i * 46} ${y} q ${i % 2 ? 5 : -5} -16 0 -26`} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />)}
      {layers.map(([name, color, h], i) => {
        const yy = y; y += h;
        return (
          <g key={i}>
            <rect x={x0} y={yy} width={x1 - x0} height={h} fill={color} stroke="#1c1917" strokeWidth="1" />
            {name.startsWith("C") && [...Array(6)].map((_, k) => <circle key={k} cx={x0 + 40 + k * 70} cy={yy + h / 2} r="8" fill="#78716c" />)}
            {name.startsWith("R") && [...Array(4)].map((_, k) => <line key={k} x1={x0 + 30 + k * 130} y1={yy + 10} x2={x0 + 70 + k * 130} y2={yy + h - 10} stroke="#334155" strokeWidth="1.5" />)}
            {showLabels && <Leader x={x1} y={yy + h / 2} tx={W - 60} ty={yy + h / 2} text={name} color={color === "#a8a29e" || color === "#64748b" ? "#475569" : color} side="right" />}
          </g>
        );
      })}
    </g>
  );
}

// ---- Electrolysis ----------------------------------------------------------
export function Electrolysis({ showLabels = true }) {
  const cx = W / 2, top = 120;
  return (
    <g>
      {/* Battery + wires */}
      <line x1={cx - 60} y1={top - 10} x2={cx - 60} y2={40} stroke="#334155" strokeWidth="3" />
      <line x1={cx + 60} y1={top - 10} x2={cx + 60} y2={40} stroke="#334155" strokeWidth="3" />
      <line x1={cx - 60} y1={40} x2={cx - 14} y2={40} stroke="#334155" strokeWidth="3" />
      <line x1={cx + 60} y1={40} x2={cx + 14} y2={40} stroke="#334155" strokeWidth="3" />
      <line x1={cx - 8} y1={28} x2={cx - 8} y2={52} stroke="#334155" strokeWidth="4" />
      <line x1={cx + 8} y1={34} x2={cx + 8} y2={46} stroke="#334155" strokeWidth="4" />
      <text x={cx - 60} y={26} fontSize="16" fontWeight="800" fill="#dc2626" textAnchor="middle">−</text>
      <text x={cx + 60} y={26} fontSize="16" fontWeight="800" fill="#2563eb" textAnchor="middle">+</text>
      {/* Beaker + electrolyte */}
      <path d={`M ${cx - 150} ${top} L ${cx - 150} ${H - 70} Q ${cx - 150} ${H - 40} ${cx - 120} ${H - 40} L ${cx + 120} ${H - 40} Q ${cx + 150} ${H - 40} ${cx + 150} ${H - 70} L ${cx + 150} ${top}`} fill="#bae6fd" fillOpacity="0.5" stroke="#0284c7" strokeWidth="2.5" />
      {/* Electrodes */}
      <rect x={cx - 66} y={top - 10} width="12" height={H - top - 60} fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
      <rect x={cx + 54} y={top - 10} width="12" height={H - top - 60} fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
      {/* Ion movement + bubbles */}
      <line x1={cx + 20} y1={H - 120} x2={cx - 44} y2={H - 120} stroke="#dc2626" strokeWidth="2" markerEnd="url(#il-arrow)" />
      <line x1={cx - 20} y1={H - 90} x2={cx + 44} y2={H - 90} stroke="#2563eb" strokeWidth="2" markerEnd="url(#il-arrow)" />
      {[...Array(4)].map((_, i) => <circle key={i} cx={cx - 60 + (i % 2) * 8} cy={top + 30 + i * 22} r="4" fill="none" stroke="#0891b2" strokeWidth="1.5" />)}
      {[...Array(4)].map((_, i) => <circle key={`b${i}`} cx={cx + 60 - (i % 2) * 8} cy={top + 30 + i * 22} r="4" fill="none" stroke="#0891b2" strokeWidth="1.5" />)}
      {showLabels && (
        <g>
          <Leader x={cx - 60} y={top + 40} tx={70} ty={top} text="Cathode (−)" color="#dc2626" side="left" />
          <Leader x={cx + 60} y={top + 40} tx={W - 70} ty={top} text="Anode (+)" color="#2563eb" side="right" />
          <text x={cx} y={H - 150} fontSize="11" fill="#dc2626" textAnchor="middle">cations →</text>
          <text x={cx} y={H - 72} fontSize="11" fill="#2563eb" textAnchor="middle">anions →</text>
          <text x={cx} y={H - 30} fontSize="11" fill="#0284c7" textAnchor="middle">electrolyte</text>
        </g>
      )}
    </g>
  );
}

// ---- Distillation ----------------------------------------------------------
export function Distillation({ showLabels = true }) {
  return (
    <g>
      {/* Flask + liquid + heat */}
      <path d="M 150 210 L 150 150 M 130 150 L 170 150" stroke="#334155" strokeWidth="2.5" fill="none" />
      <circle cx={150} cy={250} r={44} fill="#bae6fd" fillOpacity="0.5" stroke="#334155" strokeWidth="2.5" />
      <path d="M 118 268 A 44 44 0 0 0 182 268 Z" fill="#7dd3fc" />
      <path d="M 138 300 q 6 -16 12 0 q 6 16 12 0" fill="none" stroke="#f97316" strokeWidth="3" />
      {/* thermometer */}
      <line x1={150} y1={150} x2={150} y2={110} stroke="#dc2626" strokeWidth="3" />
      <circle cx={150} cy={110} r="6" fill="#dc2626" />
      {/* Delivery tube to condenser */}
      <path d="M 170 176 Q 250 150 300 200 L 470 320" stroke="#334155" strokeWidth="2.5" fill="none" />
      {/* Condenser jacket */}
      <path d="M 300 188 L 476 308 M 312 168 L 488 288" stroke="#0284c7" strokeWidth="2" fill="none" />
      <line x1={306} y1={178} x2={482} y2={298} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" />
      {/* Collection flask */}
      <path d="M 470 320 L 470 360 M 452 360 L 452 430 Q 452 450 472 450 L 512 450 Q 532 450 532 430 L 532 360 L 514 360" stroke="#334155" strokeWidth="2.5" fill="none" />
      <path d="M 452 420 L 532 420 L 532 430 Q 532 450 512 450 L 472 450 Q 452 450 452 430 Z" fill="#7dd3fc" />
      {showLabels && (
        <g>
          <Leader x={150} y={110} tx={70} ty={90} text="Thermometer" color="#dc2626" side="left" />
          <Leader x={150} y={250} tx={70} ty={300} text="Heated mixture" color="#334155" side="left" />
          <Leader x={392} y={248} tx={392} ty={140} text="Condenser (water-cooled)" color="#0284c7" side="right" />
          <Leader x={492} y={430} tx={W - 60} ty={430} text="Distillate" color="#0284c7" side="right" />
          <text x={490} y={150} fontSize="10" fill="#0284c7">water out</text>
          <text x={470} y={330} fontSize="10" fill="#0284c7">water in</text>
        </g>
      )}
    </g>
  );
}

// ---- Breathing mechanism ---------------------------------------------------
export function Breathing({ showLabels = true }) {
  const panel = (cx, inhale) => {
    const lungR = inhale ? 60 : 46, diaphY = inhale ? 330 : 300;
    return (
      <g>
        {/* trachea */}
        <rect x={cx - 8} y={110} width="16" height="60" rx="6" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.5" />
        {/* lungs */}
        {[-1, 1].map((d, i) => <ellipse key={i} cx={cx + d * (lungR * 0.7)} cy={220} rx={lungR * 0.7} ry={lungR} fill="#fecdd3" stroke="#e11d48" strokeWidth="2" />)}
        {/* ribcage */}
        {[0, 1, 2, 3].map((i) => <path key={i} d={`M ${cx - 90} ${160 + i * 30} Q ${cx} ${150 + i * 30 - (inhale ? 14 : 0)} ${cx + 90} ${160 + i * 30}`} fill="none" stroke="#94a3b8" strokeWidth="3" />)}
        {/* diaphragm */}
        <path d={inhale ? `M ${cx - 100} ${diaphY} L ${cx + 100} ${diaphY}` : `M ${cx - 100} ${diaphY} Q ${cx} ${diaphY - 46} ${cx + 100} ${diaphY}`} fill="none" stroke="#a16207" strokeWidth="5" />
        {/* airflow arrow */}
        <line x1={cx} y1={inhale ? 80 : 170} x2={cx} y2={inhale ? 150 : 80} stroke={inhale ? "#2563eb" : "#dc2626"} strokeWidth="3" markerEnd="url(#il-arrow)" />
        {showLabels && (
          <g>
            <text x={cx} y={diaphY + 24} fontSize="11" fontWeight="600" fill="#a16207" textAnchor="middle">{inhale ? "diaphragm flattens" : "diaphragm domes up"}</text>
            <text x={cx} y={410} fontSize="14" fontWeight="800" fill="#334155" textAnchor="middle">{inhale ? "Inhalation" : "Exhalation"}</text>
          </g>
        )}
      </g>
    );
  };
  return <g>{panel(W / 4, true)}{panel((3 * W) / 4, false)}</g>;
}

// ---- Synapse ---------------------------------------------------------------
export function Synapse({ showLabels = true }) {
  const cy = H / 2;
  return (
    <g>
      {/* Presynaptic terminal */}
      <path d={`M 60 ${cy - 90} Q 340 ${cy - 120} 360 ${cy - 30} L 360 ${cy + 30} Q 340 ${cy + 120} 60 ${cy + 90} Z`} fill="#c7d2fe" stroke="#4f46e5" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* Vesicles */}
      {[[250, cy - 40], [300, cy - 10], [280, cy + 40], [320, cy + 20], [230, cy + 30]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="16" fill="none" stroke="#6366f1" strokeWidth="2" />{[...Array(4)].map((_, k) => <circle key={k} cx={x - 6 + (k % 2) * 12} cy={y - 6 + Math.floor(k / 2) * 12} r="2.6" fill="#f59e0b" />)}</g>)}
      {/* Cleft */}
      <rect x={366} y={cy - 120} width="34" height="240" fill="#f8fafc" />
      {/* Neurotransmitters crossing */}
      {[[380, cy - 30], [390, cy], [382, cy + 34], [398, cy - 60]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4.5" fill="#f59e0b" />)}
      {/* Postsynaptic membrane + receptors */}
      <path d={`M 406 ${cy - 120} L 406 ${cy + 120}`} stroke="#0f766e" strokeWidth="5" />
      <rect x={406} y={cy - 120} width={W - 60 - 406} height="240" fill="#ccfbf1" opacity="0.6" />
      {[cy - 60, cy - 20, cy + 20, cy + 60].map((y, i) => <path key={i} d={`M 402 ${y} q 12 0 12 12 q 0 -12 12 -12`} fill="none" stroke="#0d9488" strokeWidth="3" />)}
      {showLabels && (
        <g>
          <Leader x={200} y={cy - 60} tx={70} ty={cy - 130} text="Presynaptic neuron" color="#4f46e5" side="left" />
          <Leader x={285} y={cy} tx={200} ty={cy + 150} text="Synaptic vesicles (neurotransmitter)" color="#6366f1" side="left" />
          <Leader x={388} y={cy + 60} tx={388} ty={H - 24} text="Synaptic cleft" color="#334155" side="right" />
          <Leader x={W - 120} y={cy + 20} tx={W - 60} ty={cy + 110} text="Receptors (postsynaptic)" color="#0d9488" side="right" />
        </g>
      )}
    </g>
  );
}


// ---- Endocrine system ------------------------------------------------------
export function EndocrineSystem({ showLabels = true }) {
  const cx = W / 2;
  const glands = [
    ["Pituitary", cx, 92, "#dc2626"], ["Thyroid", cx, 150, "#0891b2"], ["Thymus", cx, 186, "#7c3aed"],
    ["Adrenal glands", cx - 34, 244, "#f59e0b"], ["Pancreas", cx + 30, 258, "#16a34a"], ["Gonads", cx, 320, "#ec4899"],
  ];
  return (
    <g>
      <g fill="#dbeafe" stroke="#3b82f6" strokeWidth="2" filter="url(#viz-shadow)">
        <circle cx={cx} cy={92} r="30" />
        <rect x={cx - 44} y={128} width="88" height="150" rx="22" />
        <rect x={cx - 40} y={276} width="30" height="150" rx="14" /><rect x={cx + 10} y={276} width="30" height="150" rx="14" />
      </g>
      {glands.map(([name, x, y, color], i) => (
        <g key={i}>
          <Sphere cx={x} cy={y} r={8} fill={color} />
          {showLabels && <Leader x={x} y={y} tx={i % 2 ? W - 70 : 70} ty={y} text={name} color={color} side={i % 2 ? "right" : "left"} />}
        </g>
      ))}
    </g>
  );
}

// ---- Antagonistic muscles (biceps / triceps) -------------------------------
export function AntagonisticMuscles({ showLabels = true }) {
  const sx = 180, sy = 140, ex = 300, ey = 340, wx = 520, wy = 300; // shoulder, elbow, wrist
  const bone = "#e5e7eb", boneD = "#94a3b8";
  return (
    <g>
      {/* Bones */}
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={bone} strokeWidth="18" strokeLinecap="round" />
      <line x1={ex} y1={ey} x2={wx} y2={wy} stroke={bone} strokeWidth="16" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r="10" fill="#fca5a5" stroke={boneD} strokeWidth="1" />
      {/* Biceps (contracted — short, bulging) on the inside of the joint */}
      <path d={`M ${sx + 6} ${sy + 20} Q ${ex - 40} ${ey - 90} ${ex + 40} ${ey - 30}`} fill="none" stroke="#dc2626" strokeWidth="26" strokeLinecap="round" />
      {/* Triceps (relaxed — long, thin) on the outside */}
      <path d={`M ${sx - 8} ${sy + 26} Q ${ex - 70} ${ey - 10} ${ex + 30} ${ey + 26}`} fill="none" stroke="#2563eb" strokeWidth="14" strokeLinecap="round" />
      {showLabels && (
        <g>
          <Leader x={ex - 20} y={ey - 66} tx={70} ty={140} text="Biceps (contracts)" color="#dc2626" side="left" />
          <Leader x={ex - 40} y={ey + 10} tx={70} ty={ey + 60} text="Triceps (relaxes)" color="#2563eb" side="left" />
          <Leader x={ex} y={ey} tx={W - 90} ty={ey + 20} text="Elbow joint" color="#b91c1c" side="right" />
          <text x={W / 2} y={H - 26} fontSize="12" fill="#64748b" textAnchor="middle">antagonistic pair — one contracts while the other relaxes (flexion shown)</text>
        </g>
      )}
    </g>
  );
}

// ---- Titration curve -------------------------------------------------------
export function TitrationCurve({ showLabels = true }) {
  const x0 = 90, x1 = W - 70, y0 = H - 70, y1 = 60, plotW = x1 - x0, plotH = y0 - y1;
  const pH = (v) => 1 + 13 / (1 + Math.exp(-(v - 25) / 3)); // sigmoid 0..50 mL
  const pts = [];
  for (let v = 0; v <= 50; v += 1) pts.push(`${(x0 + (v / 50) * plotW).toFixed(1)},${(y0 - (pH(v) / 14) * plotH).toFixed(1)}`);
  const eqX = x0 + (25 / 50) * plotW, eqY = y0 - (7 / 14) * plotH;
  return (
    <g>
      {/* axes */}
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="currentColor" strokeWidth="1.8" markerEnd="url(#il-arrow)" />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="currentColor" strokeWidth="1.8" markerEnd="url(#il-arrow)" />
      {[0, 7, 14].map((p, i) => <g key={i}><line x1={x0 - 5} y1={y0 - (p / 14) * plotH} x2={x0} y2={y0 - (p / 14) * plotH} stroke="currentColor" /><text x={x0 - 10} y={y0 - (p / 14) * plotH + 4} fontSize="11" fill="#64748b" textAnchor="end">{p}</text></g>)}
      <polyline points={pts.join(" ")} fill="none" stroke="#7c3aed" strokeWidth="3" />
      {/* equivalence point */}
      <circle cx={eqX} cy={eqY} r="6" fill="#dc2626" />
      <line x1={eqX} y1={eqY} x2={eqX} y2={y0} stroke="#dc2626" strokeWidth="1.2" strokeDasharray="4 4" />
      {showLabels && (
        <g>
          <text x={eqX + 10} y={eqY - 6} fontSize="11.5" fontWeight="700" fill="#dc2626">equivalence point</text>
          <text x={(x0 + x1) / 2} y={y0 + 34} fontSize="12" fill="#334155" textAnchor="middle">Volume of base added (mL)</text>
          <text x={30} y={(y0 + y1) / 2} fontSize="12" fill="#334155" textAnchor="middle" transform={`rotate(-90 30 ${(y0 + y1) / 2})`}>pH</text>
          <text x={x0 + 40} y={y0 - 30} fontSize="10.5" fill="#64748b">buffer region</text>
        </g>
      )}
    </g>
  );
}

// ---- Weather fronts (cross-section) ----------------------------------------
export function WeatherFronts({ showLabels = true }) {
  const ground = H - 80;
  return (
    <g>
      {/* Warm air mass (right, rising over the cold wedge) */}
      <path d={`M ${W / 2 - 60} ${ground} Q ${W / 2 + 60} ${ground - 200} ${W - 40} 120 L ${W - 40} ${ground} Z`} fill="#fecaca" opacity="0.55" />
      {/* Cold air wedge (left, denser, pushing under) */}
      <path d={`M 40 ${ground} L ${W / 2 + 40} ${ground} Q ${W / 2 - 40} ${ground - 120} 40 ${ground - 150} Z`} fill="#bfdbfe" opacity="0.7" />
      {/* Front boundary + cold-front triangles */}
      <path d={`M 40 ${ground - 150} Q ${W / 2 - 40} ${ground - 120} ${W / 2 + 40} ${ground}`} fill="none" stroke="#2563eb" strokeWidth="3" />
      {/* Clouds + rain above the boundary */}
      {[[W / 2 - 20, ground - 200], [W / 2 + 30, ground - 220], [W / 2 + 80, ground - 190]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="26" fill="#94a3b8" />)}
      {[...Array(7)].map((_, i) => <line key={i} x1={W / 2 - 30 + i * 22} y1={ground - 180} x2={W / 2 - 36 + i * 22} y2={ground - 150} stroke="#2563eb" strokeWidth="2" />)}
      <line x1={40} y1={ground} x2={W - 40} y2={ground} stroke="#a16207" strokeWidth="3" />
      {showLabels && (
        <g>
          <text x={150} y={ground - 60} fontSize="13" fontWeight="700" fill="#2563eb" textAnchor="middle">Cold air (dense)</text>
          <text x={W - 160} y={220} fontSize="13" fontWeight="700" fill="#dc2626" textAnchor="middle">Warm air (rises)</text>
          <Leader x={W / 2} y={ground - 120} tx={W / 2} ty={ground + 30} text="Front (boundary)" color="#2563eb" side="right" />
          <text x={W / 2 + 40} y={ground - 240} fontSize="11" fill="#334155">clouds & rain form</text>
        </g>
      )}
    </g>
  );
}

// ---- River course ----------------------------------------------------------
export function RiverCourse({ showLabels = true }) {
  return (
    <g>
      {/* Mountains (source) */}
      <path d={`M 30 ${H - 120} L 110 90 L 190 ${H - 120} Z`} fill="#cbd5e1" stroke="#64748b" strokeWidth="2" />
      <path d={`M 110 90 L 130 140 L 90 140 Z`} fill="#f8fafc" />
      {/* Sea (mouth) */}
      <path d={`M ${W - 150} 60 L ${W - 20} 60 L ${W - 20} ${H - 20} L ${W - 190} ${H - 20} Q ${W - 150} ${H / 2} ${W - 150} 60 Z`} fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
      {/* River: straight upper -> meandering middle -> wide lower -> delta */}
      <path d={`M 110 130 L 210 220 Q 300 270 240 320 Q 180 370 300 400 Q 420 430 ${W - 200} 430`} fill="none" stroke="#0ea5e9" strokeWidth="6" strokeLinecap="round" />
      {/* Delta */}
      {[-24, 0, 24].map((o, i) => <line key={i} x1={W - 210} y1={430} x2={W - 160} y2={430 + o} stroke="#0ea5e9" strokeWidth="3" />)}
      {showLabels && (
        <g>
          <Leader x={130} y={150} tx={70} ty={200} text="Source (upper course)" color="#0284c7" side="left" />
          <Leader x={260} y={300} tx={70} ty={340} text="Meanders (middle course)" color="#0284c7" side="left" />
          <Leader x={420} y={420} tx={420} ty={H - 30} text="Floodplain (lower course)" color="#0284c7" side="right" />
          <Leader x={W - 200} y={430} tx={W - 60} ty={H - 60} text="Delta / mouth" color="#0284c7" side="right" />
          <text x={150} y={80} fontSize="11" fill="#64748b" textAnchor="middle">rapids / waterfalls</text>
        </g>
      )}
    </g>
  );
}


// ---- Prism dispersion ------------------------------------------------------
export function PrismDispersion({ showLabels = true }) {
  const cx = W / 2, cy = H / 2, ax = cx, ay = cy - 90, bl = cx - 70, br = cx + 70, by = cy + 80;
  const rainbow = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#3b82f6", "#7c3aed"];
  const exX = cx + 30, exY = cy + 20;
  return (
    <g>
      {/* Prism */}
      <path d={`M ${ax} ${ay} L ${bl} ${by} L ${br} ${by} Z`} fill="#e0f2fe" stroke="#0284c7" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <path d={`M ${ax} ${ay} L ${bl} ${by} L ${br} ${by} Z`} fill="url(#viz-gloss)" opacity="0.4" />
      {/* Incoming white light */}
      <line x1={70} y1={cy - 10} x2={cx - 34} y2={exY - 6} stroke="#e2e8f0" strokeWidth="5" />
      <line x1={70} y1={cy - 10} x2={cx - 34} y2={exY - 6} stroke="#94a3b8" strokeWidth="1" />
      {/* Dispersed spectrum */}
      {rainbow.map((c, i) => <line key={i} x1={exX} y1={exY} x2={W - 60} y2={cy - 60 + i * 26} stroke={c} strokeWidth="3.5" />)}
      {showLabels && (
        <g>
          <text x={110} y={cy - 20} fontSize="12" fontWeight="600" fill="#64748b">white light</text>
          <text x={cx} y={by + 22} fontSize="12" fontWeight="700" fill="#0284c7" textAnchor="middle">glass prism</text>
          <text x={W - 60} y={cy - 78} fontSize="11.5" fontWeight="700" fill="#ef4444" textAnchor="end">spectrum (red → violet)</text>
        </g>
      )}
    </g>
  );
}

// ---- Seasons (Earth's axial tilt) ------------------------------------------
export function Seasons({ showLabels = true }) {
  const cx = W / 2, cy = H / 2, R = 175;
  // 4 positions: left=N summer (axis tilts toward Sun), right=N winter, top/bottom=equinoxes
  const pos = [
    [cx - R, cy, "Summer (N)", "N pole tilts toward Sun"],
    [cx, cy - R + 20, "Equinox", "neither pole tilts"],
    [cx + R, cy, "Winter (N)", "N pole tilts away"],
    [cx, cy + R - 20, "Equinox", "neither pole tilts"],
  ];
  return (
    <g>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 6" />
      <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={40} fill="#f59e0b" /></g>
      <text x={cx} y={cy + 4} fontSize="12" fontWeight="800" fill="#fff" textAnchor="middle">Sun</text>
      {pos.map(([x, y, name, sub], i) => (
        <g key={i}>
          <g filter="url(#viz-shadow)"><Sphere cx={x} cy={y} r={26} fill="#2563eb" /></g>
          {/* tilted axis — all parallel (~23.5° from vertical, tilting right) */}
          <line x1={x + 12} y1={y - 30} x2={x - 12} y2={y + 30} stroke="#f8fafc" strokeWidth="2.5" />
          {showLabels && <><text x={x} y={y + (y < cy ? -40 : 50)} fontSize="12" fontWeight="700" fill="#2563eb" textAnchor="middle">{name}</text>
            <text x={x} y={y + (y < cy ? -26 : 64)} fontSize="9.5" fill="#64748b" textAnchor="middle">{sub}</text></>}
        </g>
      ))}
    </g>
  );
}

// ---- Simple pendulum -------------------------------------------------------
export function Pendulum({ showLabels = true }) {
  const px = W / 2, py = 90, L = 260, ang = 28 * Math.PI / 180;
  const bx = px + L * Math.sin(ang), by = py + L * Math.cos(ang);
  const eqY = py + L;
  return (
    <g>
      {/* Support */}
      <line x1={px - 90} y1={py} x2={px + 90} y2={py} stroke="#334155" strokeWidth="6" strokeLinecap="round" />
      {[...Array(7)].map((_, i) => <line key={i} x1={px - 84 + i * 24} y1={py} x2={px - 92 + i * 24} y2={py + 12} stroke="#94a3b8" strokeWidth="1.5" />)}
      {/* Equilibrium (dashed) + string + bob */}
      <line x1={px} y1={py} x2={px} y2={eqY} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 5" />
      <line x1={px} y1={py} x2={bx} y2={by} stroke="#334155" strokeWidth="2" />
      <g filter="url(#viz-shadow)"><Sphere cx={bx} cy={by} r={22} fill="#dc2626" /></g>
      {/* Swing arc */}
      <path d={`M ${px - (bx - px)} ${by} A ${L} ${L} 0 0 1 ${bx} ${by}`} fill="none" stroke="#0ea5e9" strokeWidth="1.6" strokeDasharray="4 4" />
      {showLabels && (
        <g>
          <text x={px + 96} y={py + 4} fontSize="11" fill="#334155">pivot</text>
          <text x={(px + bx) / 2 + 8} y={(py + by) / 2} fontSize="11" fill="#334155">length L</text>
          <text x={px + 6} y={eqY - 6} fontSize="11" fill="#94a3b8">equilibrium</text>
          <text x={bx + 26} y={by + 4} fontSize="11" fontWeight="600" fill="#dc2626">bob</text>
        </g>
      )}
    </g>
  );
}

// ---- Crude oil fractional distillation -------------------------------------
export function CrudeOil({ showLabels = true }) {
  const colTop = 70, colBot = H - 70, w1 = 180, w2 = 300;
  const cx = W / 2;
  const fractions = [
    ["Refinery gas", "#a78bfa", 0.06], ["Petrol (gasoline)", "#60a5fa", 0.24],
    ["Kerosene", "#34d399", 0.44], ["Diesel", "#fbbf24", 0.62], ["Fuel oil", "#f97316", 0.8], ["Bitumen", "#78350f", 0.95],
  ];
  const yAt = (t) => colTop + t * (colBot - colTop);
  const halfAt = (t) => (w1 + (w2 - w1) * t) / 2;
  return (
    <g>
      {/* Column (trapezoid, wider at hot bottom) */}
      <path d={`M ${cx - w1 / 2} ${colTop} L ${cx + w1 / 2} ${colTop} L ${cx + w2 / 2} ${colBot} L ${cx - w2 / 2} ${colBot} Z`} fill="#f1f5f9" stroke="#334155" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* Fraction outlets */}
      {fractions.map(([name, color, t], i) => {
        const y = yAt(t), hx = halfAt(t);
        return (
          <g key={i}>
            <line x1={cx - 4} y1={y} x2={cx - 6} y2={y} stroke="#334155" strokeWidth="1" />
            <line x1={cx + hx} y1={y} x2={cx + hx + 40} y2={y} stroke={color} strokeWidth="5" markerEnd="url(#il-arrow)" />
            {showLabels && <text x={cx + hx + 46} y={y + 4} fontSize="11" fontWeight="600" fill={color}>{name}</text>}
          </g>
        );
      })}
      {/* Crude in + heat */}
      <line x1={40} y1={colBot - 30} x2={cx - w2 / 2} y2={colBot - 30} stroke="#334155" strokeWidth="5" markerEnd="url(#il-arrow)" />
      <path d={`M ${cx} ${colBot} q -8 20 0 34 q 8 -14 0 -34`} fill="#f97316" />
      {showLabels && (
        <g>
          <text x={44} y={colBot - 38} fontSize="11" fontWeight="600" fill="#334155">crude oil + heat</text>
          <text x={cx - w1 / 2 - 6} y={colTop + 4} fontSize="10" fill="#0284c7" textAnchor="end">cooler ↑</text>
          <text x={cx - w2 / 2 - 6} y={colBot} fontSize="10" fill="#dc2626" textAnchor="end">hotter ↓</text>
        </g>
      )}
    </g>
  );
}

// ---- Immune response -------------------------------------------------------
export function ImmuneResponse({ showLabels = true }) {
  const cx = W / 2, cy = H / 2;
  const antibody = (x, y, rot) => <g transform={`rotate(${rot} ${x} ${y})`} stroke="#2563eb" strokeWidth="4" fill="none" strokeLinecap="round"><line x1={x} y1={y} x2={x} y2={y + 22} /><line x1={x} y1={y} x2={x - 12} y2={y - 16} /><line x1={x} y1={y} x2={x + 12} y2={y - 16} /></g>;
  return (
    <g>
      {/* Phagocyte engulfing (right) */}
      <path d={`M ${cx + 150} ${cy - 70} q 120 -10 120 70 q 0 90 -120 70 q -40 -6 -30 -60 q -12 -50 30 -50 Z`} fill="#e9d5ff" stroke="#7c3aed" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <circle cx={cx + 210} cy={cy} r="18" fill="#7c3aed" />
      {/* Pathogen with antigen spikes (left) */}
      <g filter="url(#viz-shadow)"><Sphere cx={cx - 120} cy={cy} r={44} fill="#dc2626" /></g>
      {[...Array(12)].map((_, i) => { const a = (i / 12) * 2 * Math.PI; return <line key={i} x1={cx - 120 + 44 * Math.cos(a)} y1={cy + 44 * Math.sin(a)} x2={cx - 120 + 58 * Math.cos(a)} y2={cy + 58 * Math.sin(a)} stroke="#991b1b" strokeWidth="3" />; })}
      {/* Antibodies binding */}
      {antibody(cx - 120, cy - 66, 0)}
      {antibody(cx - 186, cy, -90)}
      {antibody(cx - 120, cy + 66, 180)}
      {showLabels && (
        <g>
          <Leader x={cx - 120} y={cy} tx={70} ty={cy + 150} text="Pathogen" color="#dc2626" side="left" />
          <text x={cx - 120 + 60} y={cy - 56} fontSize="10" fill="#991b1b">antigen</text>
          <Leader x={cx - 186} y={cy} tx={70} ty={cy - 130} text="Antibody" color="#2563eb" side="left" />
          <Leader x={cx + 210} y={cy} tx={W - 70} ty={cy - 120} text="Phagocyte (engulfs pathogen)" color="#7c3aed" side="right" />
        </g>
      )}
    </g>
  );
}


// ---- Electric motor --------------------------------------------------------
export function ElectricMotor({ showLabels = true }) {
  const cx = W / 2, cy = H / 2 - 20;
  return (
    <g>
      {/* Magnet poles */}
      <rect x={cx - 180} y={cy - 70} width="46" height="140" fill="#dc2626" /><text x={cx - 157} y={cy + 6} fontSize="22" fontWeight="800" fill="#fff" textAnchor="middle">N</text>
      <rect x={cx + 134} y={cy - 70} width="46" height="140" fill="#2563eb" /><text x={cx + 157} y={cy + 6} fontSize="22" fontWeight="800" fill="#fff" textAnchor="middle">S</text>
      {/* Field lines */}
      {[-40, 0, 40].map((o, i) => <line key={i} x1={cx - 134} y1={cy + o} x2={cx + 134} y2={cy + o} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#il-arrow)" />)}
      {/* Coil (loop) */}
      <rect x={cx - 70} y={cy - 50} width="140" height="100" fill="none" stroke="#b45309" strokeWidth="4" rx="6" />
      <path d={`M ${cx + 66} ${cy - 46} A 40 20 0 0 1 ${cx + 66} ${cy + 46}`} fill="none" stroke="#dc2626" strokeWidth="2" markerEnd="url(#il-arrow)" />
      {/* Commutator + brushes + battery */}
      <circle cx={cx - 8} cy={cy + 96} r="10" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
      <circle cx={cx + 8} cy={cy + 96} r="10" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
      <line x1={cx - 8} y1={cy + 50} x2={cx - 8} y2={cy + 86} stroke="#b45309" strokeWidth="3" />
      <line x1={cx + 8} y1={cy + 50} x2={cx + 8} y2={cy + 86} stroke="#b45309" strokeWidth="3" />
      <line x1={cx - 8} y1={cy + 106} x2={cx - 8} y2={cy + 140} stroke="#334155" strokeWidth="3" />
      <line x1={cx + 8} y1={cy + 106} x2={cx + 8} y2={cy + 140} stroke="#334155" strokeWidth="3" />
      <line x1={cx - 20} y1={cy + 140} x2={cx - 8} y2={cy + 140} stroke="#334155" strokeWidth="3" /><line x1={cx + 8} y1={cy + 140} x2={cx + 20} y2={cy + 140} stroke="#334155" strokeWidth="3" />
      <line x1={cx - 20} y1={cy + 128} x2={cx - 20} y2={cy + 152} stroke="#334155" strokeWidth="4" /><line x1={cx + 20} y1={cy + 134} x2={cx + 20} y2={cy + 146} stroke="#334155" strokeWidth="4" />
      {showLabels && (
        <g>
          <Leader x={cx} y={cy - 50} tx={cx} ty={70} text="Current-carrying coil" color="#b45309" side="right" />
          <Leader x={cx} y={cy + 96} tx={70} ty={cy + 150} text="Split-ring commutator" color="#64748b" side="left" />
          <text x={cx} y={cy + 170} fontSize="11" fill="#334155" textAnchor="middle">battery — coil rotates in the magnetic field</text>
        </g>
      )}
    </g>
  );
}

// ---- Transformer -----------------------------------------------------------
export function Transformer({ showLabels = true }) {
  const cx = W / 2, cy = H / 2, cw = 90, ch = 200;
  const coil = (x, turns, color) => Array.from({ length: turns }).map((_, i) => (
    <path key={i} d={`M ${x} ${cy - ch / 2 + 20 + i * (ch - 40) / turns} a 16 ${(ch - 40) / turns / 2} 0 1 ${x < cx ? 0 : 1} 0 ${(ch - 40) / turns}`} fill="none" stroke={color} strokeWidth="3.5" />
  ));
  return (
    <g>
      {/* Laminated iron core */}
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill="none" stroke="#64748b" strokeWidth="18" />
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill="none" stroke="#94a3b8" strokeWidth="2" />
      {/* Primary + secondary coils */}
      {coil(cx - cw / 2, 8, "#dc2626")}
      {coil(cx + cw / 2, 4, "#2563eb")}
      {/* Leads */}
      <line x1={cx - cw / 2 - 40} y1={cy - 60} x2={cx - cw / 2 - 16} y2={cy - 60} stroke="#dc2626" strokeWidth="3" />
      <line x1={cx - cw / 2 - 40} y1={cy + 60} x2={cx - cw / 2 - 16} y2={cy + 60} stroke="#dc2626" strokeWidth="3" />
      <line x1={cx + cw / 2 + 16} y1={cy - 60} x2={cx + cw / 2 + 40} y2={cy - 60} stroke="#2563eb" strokeWidth="3" />
      <line x1={cx + cw / 2 + 16} y1={cy + 60} x2={cx + cw / 2 + 40} y2={cy + 60} stroke="#2563eb" strokeWidth="3" />
      {showLabels && (
        <g>
          <text x={cx - cw / 2 - 44} y={cy - 66} fontSize="12" fontWeight="700" fill="#dc2626" textAnchor="end">Primary (Nₚ)</text>
          <text x={cx + cw / 2 + 44} y={cy - 66} fontSize="12" fontWeight="700" fill="#2563eb">Secondary (Nₛ)</text>
          <Leader x={cx} y={cy - ch / 2} tx={cx} ty={70} text="Laminated iron core" color="#64748b" side="right" />
          <text x={cx} y={H - 30} fontSize="11" fill="#334155" textAnchor="middle">Vₛ / Vₚ = Nₛ / Nₚ</text>
        </g>
      )}
    </g>
  );
}

// ---- Blood groups (ABO) ----------------------------------------------------
export function BloodGroups({ showLabels = true }) {
  const groups = [["A", ["A"], "anti-B"], ["B", ["B"], "anti-A"], ["AB", ["A", "B"], "none"], ["O", [], "anti-A, anti-B"]];
  const cw = 170, y = 170, x0 = (W - 4 * cw) / 2 + cw / 2;
  const antigen = (x, cy2, t) => t === "A"
    ? <rect x={x - 5} y={cy2 - 5} width="10" height="10" fill="#dc2626" />
    : <path d={`M ${x} ${cy2 - 6} L ${x + 6} ${cy2 + 5} L ${x - 6} ${cy2 + 5} Z`} fill="#2563eb" />;
  return (
    <g>
      {groups.map(([name, ags, ab], i) => {
        const cx = x0 + i * cw;
        return (
          <g key={i}>
            <text x={cx} y={y - 54} fontSize="20" fontWeight="800" fill="#b91c1c" textAnchor="middle">Group {name}</text>
            <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={y} r={40} fill="#fca5a5" /></g>
            {ags.length === 0 && showLabels && <text x={cx} y={y + 4} fontSize="10" fill="#7f1d1d" textAnchor="middle">no antigen</text>}
            {ags.map((t, k) => [0, 1, 2].map((m) => { const a = (k * 3 + m) / 6 * 2 * Math.PI; return <g key={`${k}-${m}`}>{antigen(cx + 40 * Math.cos(a), y + 40 * Math.sin(a), t)}</g>; }))}
            {showLabels && <text x={cx} y={y + 74} fontSize="11" fill="#334155" textAnchor="middle">antibodies: {ab}</text>}
          </g>
        );
      })}
      {showLabels && (
        <g>
          <text x={W / 2} y={y + 130} fontSize="12" fill="#64748b" textAnchor="middle">□ = A antigen · △ = B antigen · plasma carries the opposite antibodies</text>
          <text x={W / 2} y={y + 150} fontSize="11" fill="#64748b" textAnchor="middle">O = universal donor · AB = universal recipient</text>
        </g>
      )}
    </g>
  );
}

// ---- Mosquito life cycle ---------------------------------------------------
function iEggRaft(x, y) { return <g>{[...Array(7)].map((_, i) => <ellipse key={i} cx={x - 18 + i * 6} cy={y + (i % 2 ? 2 : -2)} rx="4" ry="9" fill="#4b5563" stroke="#1e293b" strokeWidth="0.8" />)}</g>; }
function iLarva(x, y) { return <g><path d={`M ${x - 26} ${y} q 14 -14 26 0 q 12 14 26 2`} fill="none" stroke="#65a30d" strokeWidth="7" strokeLinecap="round" /><circle cx={x - 26} cy={y} r="7" fill="#4d7c0f" /></g>; }
function iPupa(x, y) { return <g><circle cx={x - 8} cy={y - 6} r="14" fill="#a16207" /><path d={`M ${x} ${y} q 20 6 24 24`} fill="none" stroke="#a16207" strokeWidth="6" strokeLinecap="round" /></g>; }
function iMosquito(x, y) { return <g><ellipse cx={x} cy={y} rx="6" ry="16" fill="#334155" /><ellipse cx={x - 12} cy={y - 6} rx="14" ry="6" fill="#94a3b8" opacity="0.7" transform={`rotate(-20 ${x - 12} ${y - 6})`} /><ellipse cx={x + 12} cy={y - 6} rx="14" ry="6" fill="#94a3b8" opacity="0.7" transform={`rotate(20 ${x + 12} ${y - 6})`} /><line x1={x} y1={y - 16} x2={x - 8} y2={y - 28} stroke="#334155" strokeWidth="1.5" /><line x1={x} y1={y - 16} x2={x + 8} y2={y - 28} stroke="#334155" strokeWidth="1.5" /></g>; }
export function MosquitoLifeCycle({ showLabels = true }) {
  const stages = [
    { draw: iEggRaft, label: "Egg raft" }, { draw: iLarva, label: "Larva (wriggler)" },
    { draw: iPupa, label: "Pupa (tumbler)" }, { draw: iMosquito, label: "Adult mosquito" },
  ];
  return <LifeCycle stages={showLabels ? stages : stages.map((s) => ({ ...s, label: "" }))} R={150} />;
}

// ---- Tides (spring & neap) -------------------------------------------------
export function Tides({ showLabels = true }) {
  const bulge = (cx, cy, ang) => <ellipse cx={cx} cy={cy} rx="52" ry="40" fill="#3b82f6" opacity="0.35" transform={`rotate(${ang} ${cx} ${cy})`} />;
  return (
    <g>
      {/* Spring tide (top): Sun, Earth, Moon aligned */}
      <text x={W / 2} y={60} fontSize="14" fontWeight="800" fill="#334155" textAnchor="middle">Spring tide — Sun, Earth, Moon aligned</text>
      {bulge(230, 150, 0)}
      <g filter="url(#viz-shadow)"><Sphere cx={230} cy={150} r={30} fill="#2563eb" /></g>
      <Sphere cx={360} cy={150} r={12} fill="#94a3b8" />
      <g filter="url(#viz-shadow)"><Sphere cx={W - 70} cy={150} r={26} fill="#fbbf24" /></g>
      {showLabels && <><text x={230} y={202} fontSize="10" fill="#2563eb" textAnchor="middle">Earth</text><text x={360} y={176} fontSize="10" fill="#64748b" textAnchor="middle">Moon</text><text x={W - 70} y={188} fontSize="10" fill="#f59e0b" textAnchor="middle">Sun</text><text x={150} y={120} fontSize="10" fill="#3b82f6">high tides ↕ (largest)</text></>}
      {/* Neap tide (bottom): Sun & Moon at right angles */}
      <text x={W / 2} y={330} fontSize="14" fontWeight="800" fill="#334155" textAnchor="middle">Neap tide — Sun & Moon at right angles</text>
      {bulge(260, 420, 90)}
      <g filter="url(#viz-shadow)"><Sphere cx={260} cy={420} r={30} fill="#2563eb" /></g>
      <Sphere cx={390} cy={420} r={12} fill="#94a3b8" />
      <g filter="url(#viz-shadow)"><Sphere cx={260} cy={510} r={20} fill="#fbbf24" /></g>
      {showLabels && <><text x={390} y={446} fontSize="10" fill="#64748b" textAnchor="middle">Moon</text><text x={300} y={510} fontSize="10" fill="#f59e0b">Sun (90°)</text><text x={150} y={400} fontSize="10" fill="#3b82f6">smaller tidal range</text></>}
    </g>
  );
}


// ---- Concave mirror image formation ----------------------------------------
export function MirrorImage({ showLabels = true }) {
  const axisY = H / 2, mx = W - 140, cx = mx - 300, fx = mx - 150; // C and F on axis
  const objX = mx - 360, objTop = axisY - 70;
  // image (real, inverted) between C and F for object beyond C
  const imgX = mx - 200, imgBot = axisY + 44;
  return (
    <g>
      <line x1={80} y1={axisY} x2={mx} y2={axisY} stroke="#94a3b8" strokeWidth="1.5" />
      {/* concave mirror arc */}
      <path d={`M ${mx} ${axisY - 110} A 150 150 0 0 0 ${mx} ${axisY + 110}`} fill="none" stroke="#334155" strokeWidth="4" />
      {[cx, fx].map((x, i) => <g key={i}><circle cx={x} cy={axisY} r="3" fill="#64748b" /><text x={x} y={axisY + 18} fontSize="11" fill="#64748b" textAnchor="middle">{i ? "F" : "C"}</text></g>)}
      {/* object */}
      <line x1={objX} y1={axisY} x2={objX} y2={objTop} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* rays */}
      <polyline points={`${objX},${objTop} ${mx - 6},${objTop} ${imgX},${imgBot}`} fill="none" stroke="#f59e0b" strokeWidth="1.8" />
      <polyline points={`${objX},${objTop} ${mx - 6},${axisY} ${imgX},${imgBot}`} fill="none" stroke="#dc2626" strokeWidth="1.8" />
      {/* image */}
      <line x1={imgX} y1={axisY} x2={imgX} y2={imgBot} stroke="#7c3aed" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={objX} y={objTop - 8} fontSize="11" fill="#16a34a" textAnchor="middle">object</text>
          <text x={imgX} y={imgBot + 16} fontSize="11" fill="#7c3aed" textAnchor="middle">image (real, inverted)</text>
          <text x={mx + 6} y={axisY - 96} fontSize="11" fill="#334155">concave mirror</text>
          <text x={110} y={axisY - 8} fontSize="10.5" fill="#64748b">principal axis</text>
        </g>
      )}
    </g>
  );
}

// ---- Carbon allotropes -----------------------------------------------------
export function CarbonAllotropes({ showLabels = true }) {
  const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" ");
  const c1 = 150, c2 = W / 2, c3 = W - 150, cy = H / 2 - 10;
  return (
    <g>
      {/* Diamond (tetrahedral) */}
      <g>
        {[[0, -40], [-34, 20], [34, 20], [0, 46]].map(([dx, dy], i) => <line key={i} x1={c1} y1={cy} x2={c1 + dx} y2={cy + dy} stroke="#334155" strokeWidth="2.5" />)}
        {[[0, 0], [0, -40], [-34, 20], [34, 20], [0, 46]].map(([dx, dy], i) => <Sphere key={i} cx={c1 + dx} cy={cy + dy} r={i === 0 ? 12 : 10} fill="#334155" />)}
      </g>
      {/* Graphite (layers of hexagons) */}
      <g>
        {[0, 1, 2].map((L) => <polygon key={L} points={hexPts(c2, cy - 30 + L * 34, 26)} fill="none" stroke="#0891b2" strokeWidth="2.5" transform={`skewX(-20)`} />)}
      </g>
      {/* Fullerene (buckyball) */}
      <g>
        <circle cx={c3} cy={cy} r="44" fill="none" stroke="#7c3aed" strokeWidth="2" />
        <polygon points={hexPts(c3, cy, 22)} fill="none" stroke="#7c3aed" strokeWidth="2" />
        {Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return <line key={i} x1={c3 + 22 * Math.cos(a)} y1={cy + 22 * Math.sin(a)} x2={c3 + 44 * Math.cos(a)} y2={cy + 44 * Math.sin(a)} stroke="#7c3aed" strokeWidth="1.6" />; })}
      </g>
      {showLabels && (
        <g>
          <text x={c1} y={cy + 96} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Diamond</text>
          <text x={c1} y={cy + 112} fontSize="10" fill="#64748b" textAnchor="middle">tetrahedral, hard</text>
          <text x={c2} y={cy + 96} fontSize="13" fontWeight="700" fill="#0891b2" textAnchor="middle">Graphite</text>
          <text x={c2} y={cy + 112} fontSize="10" fill="#64748b" textAnchor="middle">layers, conducts</text>
          <text x={c3} y={cy + 96} fontSize="13" fontWeight="700" fill="#7c3aed" textAnchor="middle">Fullerene (C₆₀)</text>
          <text x={c3} y={cy + 112} fontSize="10" fill="#64748b" textAnchor="middle">molecular cage</text>
        </g>
      )}
    </g>
  );
}

// ---- Aerobic vs anaerobic respiration --------------------------------------
export function RespirationTypes({ showLabels = true }) {
  return (
    <g>
      <g filter="url(#viz-shadow)"><rect x={60} y={130} width={W / 2 - 100} height={260} rx="14" fill="#dcfce7" stroke="#16a34a" strokeWidth="2.5" /></g>
      <g filter="url(#viz-shadow)"><rect x={W / 2 + 40} y={130} width={W / 2 - 100} height={260} rx="14" fill="#fee2e2" stroke="#dc2626" strokeWidth="2.5" /></g>
      {showLabels && (
        <g textAnchor="middle">
          <text x={60 + (W / 2 - 100) / 2} y={168} fontSize="16" fontWeight="800" fill="#16a34a">Aerobic</text>
          <text x={60 + (W / 2 - 100) / 2} y={210} fontSize="12" fill="#166534">glucose + oxygen</text>
          <text x={60 + (W / 2 - 100) / 2} y={236} fontSize="18" fill="#16a34a">↓</text>
          <text x={60 + (W / 2 - 100) / 2} y={266} fontSize="12" fill="#166534">carbon dioxide + water</text>
          <text x={60 + (W / 2 - 100) / 2} y={318} fontSize="14" fontWeight="700" fill="#15803d">large ATP yield (~38)</text>
          <text x={60 + (W / 2 - 100) / 2} y={344} fontSize="11" fill="#64748b">needs O₂ · in mitochondria</text>

          <text x={W / 2 + 40 + (W / 2 - 100) / 2} y={168} fontSize="16" fontWeight="800" fill="#dc2626">Anaerobic</text>
          <text x={W / 2 + 40 + (W / 2 - 100) / 2} y={206} fontSize="12" fill="#7f1d1d">glucose</text>
          <text x={W / 2 + 40 + (W / 2 - 100) / 2} y={230} fontSize="18" fill="#dc2626">↓</text>
          <text x={W / 2 + 40 + (W / 2 - 100) / 2} y={258} fontSize="11.5" fill="#7f1d1d">lactic acid (muscle)</text>
          <text x={W / 2 + 40 + (W / 2 - 100) / 2} y={278} fontSize="11.5" fill="#7f1d1d">ethanol + CO₂ (yeast)</text>
          <text x={W / 2 + 40 + (W / 2 - 100) / 2} y={322} fontSize="14" fontWeight="700" fill="#b91c1c">small ATP yield (~2)</text>
          <text x={W / 2 + 40 + (W / 2 - 100) / 2} y={348} fontSize="11" fill="#64748b">no O₂ · in cytoplasm</text>
        </g>
      )}
    </g>
  );
}

// ---- Renewable energy sources ----------------------------------------------
export function RenewableEnergy({ showLabels = true }) {
  const gy = H - 90;
  return (
    <g>
      {/* Solar */}
      <g filter="url(#viz-shadow)"><Sphere cx={130} cy={110} r={26} fill="#fbbf24" /></g>
      <rect x={90} y={gy - 60} width="90" height="56" rx="4" fill="#1e3a8a" stroke="#334155" strokeWidth="2" transform={`rotate(-12 135 ${gy - 32})`} />
      {[...Array(3)].map((_, i) => <line key={i} x1={100 + i * 26} y1={gy - 66} x2={110 + i * 26} y2={gy - 2} stroke="#3b82f6" strokeWidth="1" transform={`rotate(-12 135 ${gy - 32})`} />)}
      {/* Wind turbine */}
      <line x1={W / 2} y1={gy} x2={W / 2} y2={gy - 130} stroke="#94a3b8" strokeWidth="8" strokeLinecap="round" />
      {[0, 120, 240].map((a, i) => <line key={i} x1={W / 2} y1={gy - 130} x2={W / 2 + 54 * Math.cos((a - 90) * Math.PI / 180)} y2={gy - 130 + 54 * Math.sin((a - 90) * Math.PI / 180)} stroke="#0891b2" strokeWidth="6" strokeLinecap="round" />)}
      <circle cx={W / 2} cy={gy - 130} r="6" fill="#334155" />
      {/* Hydro dam */}
      <path d={`M ${W - 210} ${gy} L ${W - 210} ${gy - 90} L ${W - 120} ${gy - 60} L ${W - 120} ${gy} Z`} fill="#94a3b8" stroke="#475569" strokeWidth="2" />
      <path d={`M ${W - 210} ${gy - 84} L ${W - 260} ${gy - 84} L ${W - 260} ${gy} L ${W - 210} ${gy} Z`} fill="#38bdf8" opacity="0.7" />
      {/* Ground */}
      <line x1={40} y1={gy} x2={W - 40} y2={gy} stroke="#16a34a" strokeWidth="4" />
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={135} y={gy + 24} fontSize="12" fontWeight="700">Solar</text>
          <text x={W / 2} y={gy + 24} fontSize="12" fontWeight="700">Wind</text>
          <text x={W - 170} y={gy + 24} fontSize="12" fontWeight="700">Hydroelectric</text>
          <text x={W / 2} y={40} fontSize="13" fontWeight="700">Renewable energy sources</text>
        </g>
      )}
    </g>
  );
}

// ---- Latitude & longitude --------------------------------------------------
export function LatLong({ showLabels = true }) {
  const cx = W / 2 - 20, cy = H / 2, R = 180;
  return (
    <g>
      <g filter="url(#viz-shadow)"><circle cx={cx} cy={cy} r={R} fill="#dbeafe" stroke="#0284c7" strokeWidth="2.5" /></g>
      <circle cx={cx} cy={cy} r={R} fill="url(#viz-gloss)" opacity="0.4" />
      {/* Latitude lines */}
      {[-0.66, -0.33, 0.33, 0.66].map((f, i) => { const yy = cy + f * R, w = R * Math.sqrt(1 - f * f); return <line key={i} x1={cx - w} y1={yy} x2={cx + w} y2={yy} stroke="#60a5fa" strokeWidth="1.2" />; })}
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#dc2626" strokeWidth="2.5" />
      {/* Longitude lines (ellipse arcs) */}
      {[0.4, 0.75, 1].map((f, i) => <ellipse key={i} cx={cx} cy={cy} rx={R * f} ry={R} fill="none" stroke="#60a5fa" strokeWidth="1.2" />)}
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="#16a34a" strokeWidth="2.5" />
      {showLabels && (
        <g>
          <Leader x={cx + R} y={cy} tx={W - 60} ty={cy} text="Equator (0° lat)" color="#dc2626" side="right" />
          <Leader x={cx} y={cy - R} tx={cx} ty={40} text="Prime Meridian (0° long)" color="#16a34a" side="right" />
          <Leader x={cx - R * 0.7} y={cy - R * 0.5} tx={70} ty={cy - 90} text="Latitude (parallels)" color="#2563eb" side="left" />
          <Leader x={cx - R * 0.4} y={cy + R * 0.7} tx={70} ty={cy + 120} text="Longitude (meridians)" color="#2563eb" side="left" />
        </g>
      )}
    </g>
  );
}


// ---- Enzyme action (lock & key) --------------------------------------------
export function EnzymeAction({ showLabels = true }) {
  const y = H / 2;
  const enzyme = (x, notch) => <path d={`M ${x - 50} ${y - 40} h 100 v 30 ${notch ? `q -18 0 -18 ${18} q 0 18 18 18` : "q -18 0 -18 18 q 0 18 18 18"} v 22 h -100 z`} fill="#c7d2fe" stroke="#4f46e5" strokeWidth="2" />;
  const sub = (x) => <path d={`M ${x} ${y - 10} q 18 0 18 18 q 0 18 -18 18 h -26 v -36 z`} fill="#f59e0b" stroke="#b45309" strokeWidth="2" />;
  const ax1 = 130, ax2 = W / 2, ax3 = W - 140;
  return (
    <g>
      {/* Stage 1: enzyme + substrate */}
      {enzyme(ax1)}<g transform={`translate(${ax1 - 96} 0)`}>{sub(ax1)}</g>
      {/* Stage 2: complex */}
      {enzyme(ax2)}{sub(ax2 + 32)}
      {/* Stage 3: products released */}
      {enzyme(ax3)}
      <path d={`M ${ax3 + 40} ${y - 6} q 14 0 14 14 q 0 14 -14 14 z`} fill="#f97316" stroke="#b45309" strokeWidth="1.5" />
      <path d={`M ${ax3 + 40} ${y + 26} q 14 0 14 -12 z`} fill="#fbbf24" stroke="#b45309" strokeWidth="1.5" />
      {/* arrows */}
      <line x1={ax1 + 70} y1={y} x2={ax2 - 70} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <line x1={ax2 + 70} y1={y} x2={ax3 - 70} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={ax1} y={y + 66} fontSize="11.5" fontWeight="700">Enzyme + substrate</text>
          <text x={ax1 - 70} y={y - 24} fontSize="10" fill="#b45309">substrate</text>
          <text x={ax1 + 44} y={y + 4} fontSize="9.5" fill="#4f46e5">active site</text>
          <text x={ax2} y={y + 66} fontSize="11.5" fontWeight="700">Enzyme–substrate complex</text>
          <text x={ax3} y={y + 66} fontSize="11.5" fontWeight="700">Products + enzyme (reused)</text>
        </g>
      )}
    </g>
  );
}

// ---- Osmosis ---------------------------------------------------------------
export function Osmosis({ showLabels = true }) {
  const x0 = 120, x1 = W - 120, top = 130, bot = H - 90, mid = (x0 + x1) / 2;
  return (
    <g>
      <rect x={x0} y={top} width={x1 - x0} height={bot - top} fill="none" stroke="#334155" strokeWidth="2.5" />
      <rect x={x0} y={top} width={mid - x0} height={bot - top} fill="#dbeafe" opacity="0.5" />
      <rect x={mid} y={top} width={x1 - mid} height={bot - top} fill="#bfdbfe" opacity="0.7" />
      {/* semipermeable membrane */}
      <line x1={mid} y1={top} x2={mid} y2={bot} stroke="#7c3aed" strokeWidth="3" strokeDasharray="6 5" />
      {/* solute dots: few left, many right */}
      {[...Array(4)].map((_, i) => <circle key={`l${i}`} cx={x0 + 50 + (i % 2) * 60} cy={top + 60 + i * 50} r="9" fill="#f59e0b" />)}
      {[...Array(9)].map((_, i) => <circle key={`r${i}`} cx={mid + 40 + (i % 3) * 60} cy={top + 50 + Math.floor(i / 3) * 70} r="9" fill="#f59e0b" />)}
      {/* water movement arrows through membrane (left -> right) */}
      {[0, 1, 2].map((i) => <line key={i} x1={mid - 40} y1={top + 60 + i * 90} x2={mid + 40} y2={top + 60 + i * 90} stroke="#0ea5e9" strokeWidth="3" markerEnd="url(#il-arrow)" />)}
      {showLabels && (
        <g>
          <text x={(x0 + mid) / 2} y={top - 10} fontSize="12" fontWeight="700" fill="#0284c7" textAnchor="middle">dilute (more water)</text>
          <text x={(mid + x1) / 2} y={top - 10} fontSize="12" fontWeight="700" fill="#1d4ed8" textAnchor="middle">concentrated (more solute)</text>
          <Leader x={mid} y={bot - 20} tx={mid} ty={H - 24} text="semipermeable membrane" color="#7c3aed" side="right" />
          <text x={mid} y={top + 40} fontSize="10.5" fill="#0ea5e9" textAnchor="middle">water moves →</text>
        </g>
      )}
    </g>
  );
}

// ---- Convex lens image formation -------------------------------------------
export function ConvexLens({ showLabels = true }) {
  const cx = W / 2, ay = H / 2, f = 90, objX = cx - 220, objTop = ay - 70;
  const diX = cx + 150, imgBot = ay + 48;
  return (
    <g>
      <line x1={80} y1={ay} x2={W - 80} y2={ay} stroke="#94a3b8" strokeWidth="1.5" />
      {/* lens */}
      <ellipse cx={cx} cy={ay} rx="18" ry="120" fill="#bae6fd" fillOpacity="0.6" stroke="#0284c7" strokeWidth="2.5" />
      {[-2, -1, 1, 2].map((k, i) => <g key={i}><circle cx={cx + k * f} cy={ay} r="3" fill="#64748b" /><text x={cx + k * f} y={ay + 16} fontSize="10" fill="#64748b" textAnchor="middle">{Math.abs(k) === 2 ? "2F" : "F"}</text></g>)}
      {/* object */}
      <line x1={objX} y1={ay} x2={objX} y2={objTop} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* rays: parallel then through F; through centre */}
      <polyline points={`${objX},${objTop} ${cx},${objTop} ${diX},${imgBot}`} fill="none" stroke="#f59e0b" strokeWidth="1.8" />
      <polyline points={`${objX},${objTop} ${diX},${imgBot}`} fill="none" stroke="#dc2626" strokeWidth="1.8" />
      {/* image */}
      <line x1={diX} y1={ay} x2={diX} y2={imgBot} stroke="#7c3aed" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={objX} y={objTop - 8} fontSize="11" fill="#16a34a" textAnchor="middle">object (beyond 2F)</text>
          <text x={diX} y={imgBot + 16} fontSize="11" fill="#7c3aed" textAnchor="middle">real, inverted image</text>
          <text x={cx} y={ay - 126} fontSize="11" fill="#0284c7" textAnchor="middle">convex lens</text>
        </g>
      )}
    </g>
  );
}

// ---- Neutralization --------------------------------------------------------
export function Neutralization({ showLabels = true }) {
  const beaker = (x, fill, label, sub) => (
    <g>
      <path d={`M ${x - 40} 150 L ${x - 40} 300 Q ${x - 40} 320 ${x - 20} 320 L ${x + 20} 320 Q ${x + 40} 320 ${x + 40} 300 L ${x + 40} 150`} fill="none" stroke="#334155" strokeWidth="2.5" />
      <path d={`M ${x - 40} 230 L ${x - 40} 300 Q ${x - 40} 320 ${x - 20} 320 L ${x + 20} 320 Q ${x + 40} 320 ${x + 40} 300 L ${x + 40} 230 Z`} fill={fill} opacity="0.6" />
      {showLabels && <><text x={x} y={352} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">{label}</text><text x={x} y={370} fontSize="11" fill="#64748b" textAnchor="middle">{sub}</text></>}
    </g>
  );
  return (
    <g>
      {beaker(150, "#fca5a5", "Acid", "HCl (low pH)")}
      <text x={290} y={250} fontSize="30" fill="#334155" textAnchor="middle">+</text>
      {beaker(420, "#93c5fd", "Base", "NaOH (high pH)")}
      <line x1={480} y1={250} x2={560} y2={250} stroke="#334155" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {beaker(660, "#d1fae5", "Salt + water", "NaCl (neutral)")}
      {showLabels && <text x={W / 2} y={H - 30} fontSize="14" fontWeight="700" fill="#334155" textAnchor="middle">HCl + NaOH → NaCl + H₂O</text>}
    </g>
  );
}

// ---- Earthquake (focus, epicentre, seismic waves) --------------------------
export function Earthquake({ showLabels = true }) {
  const ground = 180, fx = W / 2 - 30, fy = 360;
  return (
    <g>
      {/* Ground + underground */}
      <rect x={40} y={ground} width={W - 80} height={H - ground - 20} fill="#a16207" opacity="0.25" />
      <line x1={40} y1={ground} x2={W - 40} y2={ground} stroke="#15803d" strokeWidth="4" />
      {/* Fault line */}
      <line x1={fx - 60} y1={H - 30} x2={fx + 60} y2={ground - 10} stroke="#334155" strokeWidth="2.5" strokeDasharray="8 5" />
      {/* Focus + seismic waves */}
      {[40, 90, 140, 190].map((r, i) => <circle key={i} cx={fx} cy={fy} r={r} fill="none" stroke="#dc2626" strokeWidth="1.6" opacity={1 - i * 0.2} />)}
      <Sphere cx={fx} cy={fy} r={10} fill="#dc2626" />
      {/* Epicentre (surface above focus) */}
      <Sphere cx={fx} cy={ground} r={8} fill="#f59e0b" />
      <line x1={fx} y1={ground} x2={fx} y2={fy} stroke="#334155" strokeWidth="1.2" strokeDasharray="4 4" />
      {showLabels && (
        <g>
          <Leader x={fx} y={fy} tx={70} ty={fy} text="Focus (hypocentre)" color="#dc2626" side="left" />
          <Leader x={fx} y={ground} tx={W - 70} ty={ground - 30} text="Epicentre" color="#f59e0b" side="right" />
          <text x={fx + 150} y={fy - 60} fontSize="11" fill="#dc2626">seismic waves</text>
          <text x={fx + 70} y={H - 40} fontSize="11" fill="#334155">fault</text>
        </g>
      )}
    </g>
  );
}


// ---- Day & night (Earth's rotation) ----------------------------------------
export function DayNight({ showLabels = true }) {
  const cx = W / 2, cy = H / 2, R = 150;
  return (
    <g>
      {/* Sunlight from the left */}
      {[-60, 0, 60].map((o, i) => <line key={i} x1={60} y1={cy + o} x2={cx - R - 10} y2={cy + o} stroke="#f59e0b" strokeWidth="3" markerEnd="url(#il-arrow)" />)}
      <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={R} fill="#2563eb" /></g>
      {/* Night half (right) shaded */}
      <path d={`M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} Z`} fill="#0f172a" opacity="0.6" />
      {/* Axis + rotation arrow */}
      <line x1={cx + 12} y1={cy - R - 14} x2={cx - 12} y2={cy + R + 14} stroke="#334155" strokeWidth="2" strokeDasharray="5 4" />
      <path d={`M ${cx - 40} ${cy - R - 8} A 46 20 0 0 1 ${cx + 40} ${cy - R - 8}`} fill="none" stroke="#16a34a" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <text x={cx - R / 2} y={cy} fontSize="14" fontWeight="800" fill="#fde68a" textAnchor="middle">DAY</text>
          <text x={cx + R / 2} y={cy} fontSize="14" fontWeight="800" fill="#e2e8f0" textAnchor="middle">NIGHT</text>
          <text x={120} y={cy - 76} fontSize="12" fontWeight="600" fill="#f59e0b">sunlight</text>
          <text x={cx} y={cy - R - 24} fontSize="11" fill="#16a34a" textAnchor="middle">rotation (W → E)</text>
          <Leader x={cx + 6} y={cy + R} tx={W - 70} ty={cy + R + 20} text="axis" color="#334155" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- DNA replication -------------------------------------------------------
export function DnaReplication({ showLabels = true }) {
  const y = H / 2, x0 = 90, fork = W / 2 - 20;
  const BASE = { A: "#2563eb", T: "#ef4444", G: "#16a34a", C: "#f59e0b" };
  const seq = ["A", "T", "G", "C", "A", "G"];
  return (
    <g>
      {/* Parent double strand (left, joined) */}
      <line x1={x0} y1={y - 30} x2={fork} y2={y - 30} stroke="#334155" strokeWidth="4" />
      <line x1={x0} y1={y + 30} x2={fork} y2={y + 30} stroke="#334155" strokeWidth="4" />
      {seq.map((b, i) => { const x = x0 + 30 + i * 60; if (x > fork) return null; return <g key={i}><line x1={x} y1={y - 28} x2={x} y2={y + 28} stroke={BASE[b]} strokeWidth="3" /></g>; })}
      {/* Fork: two separated strands going right */}
      <path d={`M ${fork} ${y - 30} Q ${fork + 60} ${y - 40} ${W - 80} ${y - 70}`} fill="none" stroke="#334155" strokeWidth="4" />
      <path d={`M ${fork} ${y + 30} Q ${fork + 60} ${y + 40} ${W - 80} ${y + 70}`} fill="none" stroke="#334155" strokeWidth="4" />
      {/* New complementary strands (colored, dashed backbone) */}
      <path d={`M ${fork} ${y - 30} Q ${fork + 60} ${y - 20} ${W - 80} ${y - 10}`} fill="none" stroke="#7c3aed" strokeWidth="3" strokeDasharray="6 4" />
      <path d={`M ${fork} ${y + 30} Q ${fork + 60} ${y + 20} ${W - 80} ${y + 10}`} fill="none" stroke="#7c3aed" strokeWidth="3" strokeDasharray="6 4" />
      {showLabels && (
        <g>
          <text x={x0 + 60} y={y - 44} fontSize="12" fontWeight="700" fill="#334155">parent DNA</text>
          <Leader x={fork} y={y} tx={fork} ty={H - 30} text="replication fork" color="#334155" side="right" />
          <text x={W - 120} y={y - 78} fontSize="11" fill="#334155">original strand</text>
          <text x={W - 120} y={y + 2} fontSize="11" fill="#7c3aed">new strand</text>
        </g>
      )}
    </g>
  );
}

// ---- Radioactive decay (alpha, beta, gamma) --------------------------------
export function RadioactiveDecay({ showLabels = true }) {
  const nx = 150, ny = H / 2;
  const rows = [
    ["α", "alpha (He nucleus)", "#dc2626", 150, "paper"],
    ["β", "beta (electron)", "#2563eb", 250, "aluminium"],
    ["γ", "gamma (EM wave)", "#7c3aed", 350, "lead"],
  ];
  return (
    <g>
      {/* Nucleus */}
      <g filter="url(#viz-shadow)"><Sphere cx={nx} cy={ny} r={40} fill="#334155" /></g>
      {[...Array(8)].map((_, i) => { const a = i / 8 * 2 * Math.PI; return <circle key={i} cx={nx + 16 * Math.cos(a)} cy={ny + 16 * Math.sin(a)} r="7" fill={i % 2 ? "#ef4444" : "#3b82f6"} />; })}
      {rows.map(([sym, name, color, y, stop], i) => (
        <g key={i}>
          <line x1={nx + 44} y1={ny} x2={W - 220} y2={y} stroke={color} strokeWidth="3" markerEnd="url(#il-arrow)" />
          <text x={nx + 120} y={((ny + y) / 2) - 6} fontSize="15" fontWeight="800" fill={color}>{sym}</text>
          {/* stopping barrier */}
          <rect x={W - 210} y={y - 26} width="12" height="52" fill="#94a3b8" />
          {showLabels && <><text x={W - 190} y={y + 4} fontSize="11" fontWeight="600" fill={color}>{name}</text><text x={W - 204} y={y - 32} fontSize="9" fill="#64748b" textAnchor="middle">{stop}</text></>}
        </g>
      ))}
      {showLabels && <text x={nx} y={ny + 66} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">unstable nucleus</text>}
    </g>
  );
}

// ---- Periodic table trends -------------------------------------------------
export function PeriodicTrends({ showLabels = true }) {
  const x0 = 150, y0 = 130, cell = 26, cols = 18, rows = 7;
  const filled = (r, c) => (r === 0 ? c === 0 || c === 17 : r === 1 || r === 2 ? c < 2 || c > 11 : true);
  return (
    <g>
      {Array.from({ length: rows }).map((_, r) => Array.from({ length: cols }).map((_, c) => filled(r, c) ? <rect key={`${r}-${c}`} x={x0 + c * cell} y={y0 + r * cell} width={cell - 2} height={cell - 2} rx="2" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" /> : null))}
      {showLabels && (
        <g>
          {/* Atomic radius: increases down & left */}
          <line x1={x0 + cols * cell + 20} y1={y0} x2={x0 + cols * cell + 20} y2={y0 + rows * cell} stroke="#16a34a" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
          <text x={x0 + cols * cell + 34} y={y0 + rows * cell / 2} fontSize="11" fill="#16a34a" transform={`rotate(90 ${x0 + cols * cell + 34} ${y0 + rows * cell / 2})`} textAnchor="middle">atomic radius increases ↓</text>
          <line x1={x0 + cols * cell} y1={y0 - 16} x2={x0} y2={y0 - 16} stroke="#16a34a" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
          <text x={x0 + cols * cell / 2} y={y0 - 22} fontSize="11" fill="#16a34a" textAnchor="middle">atomic radius increases ←</text>
          {/* Electronegativity: increases up & right */}
          <line x1={x0} y1={y0 + rows * cell + 20} x2={x0 + cols * cell} y2={y0 + rows * cell + 20} stroke="#dc2626" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
          <text x={x0 + cols * cell / 2} y={y0 + rows * cell + 40} fontSize="11" fill="#dc2626" textAnchor="middle">electronegativity increases →</text>
        </g>
      )}
    </g>
  );
}

// ---- Continental drift (Pangaea → present) ---------------------------------
export function ContinentalDrift({ showLabels = true }) {
  const blob = (cx, cy, pts, fill) => <path d={pts} fill={fill} stroke="#15803d" strokeWidth="1.5" transform={`translate(${cx} ${cy})`} />;
  const globe = (cx, cy) => <><g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={120} fill="#bae6fd" /></g><circle cx={cx} cy={cy} r={120} fill="url(#viz-gloss)" opacity="0.4" /></>;
  return (
    <g>
      {/* Pangaea (left) — one supercontinent */}
      {globe(210, H / 2)}
      {blob(210, H / 2, "M -60 -50 q 60 -20 90 20 q 30 40 -10 70 q -50 40 -100 10 q -40 -30 -10 -60 q 10 -30 40 -40 Z", "#22c55e")}
      {/* Present (right) — separated continents */}
      {globe(W - 210, H / 2)}
      {[["M -70 -40 q 30 -14 44 10 q 6 30 -20 34 q -34 4 -34 -20 z", "#22c55e"], ["M 6 -46 q 40 -6 40 30 q -6 34 -34 26 q -20 -30 -6 -56 z", "#16a34a"], ["M -20 30 q 30 -6 40 20 q -4 26 -34 20 q -20 -20 -6 -40 z", "#4ade80"], ["M 40 34 q 24 0 24 22 q -10 18 -30 8 z", "#22c55e"]].map(([p, c]) => blob(W - 210, H / 2, p, c))}
      {/* Arrow */}
      <line x1={340} y1={H / 2} x2={W - 340} y2={H / 2} stroke="#334155" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={210} y={H / 2 + 150} fontSize="14" fontWeight="800">Pangaea</text>
          <text x={210} y={H / 2 + 168} fontSize="10" fill="#64748b">~300 million years ago</text>
          <text x={W - 210} y={H / 2 + 150} fontSize="14" fontWeight="800">Present day</text>
          <text x={W / 2} y={H / 2 - 14} fontSize="11" fill="#64748b">continents drift apart</text>
        </g>
      )}
    </g>
  );
}


// ---- Electric generator (dynamo) -------------------------------------------
export function ElectricGenerator({ showLabels = true }) {
  const cx = W / 2, cy = H / 2 - 20;
  return (
    <g>
      <rect x={cx - 180} y={cy - 70} width="46" height="140" fill="#dc2626" /><text x={cx - 157} y={cy + 6} fontSize="22" fontWeight="800" fill="#fff" textAnchor="middle">N</text>
      <rect x={cx + 134} y={cy - 70} width="46" height="140" fill="#2563eb" /><text x={cx + 157} y={cy + 6} fontSize="22" fontWeight="800" fill="#fff" textAnchor="middle">S</text>
      {[-40, 0, 40].map((o, i) => <line key={i} x1={cx - 134} y1={cy + o} x2={cx + 134} y2={cy + o} stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#il-arrow)" />)}
      <rect x={cx - 70} y={cy - 50} width="140" height="100" fill="none" stroke="#b45309" strokeWidth="4" rx="6" />
      {/* mechanical rotation input */}
      <path d={`M ${cx - 66} ${cy - 54} A 40 20 0 0 1 ${cx + 66} ${cy - 54}`} fill="none" stroke="#16a34a" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {/* slip rings (full rings) + brushes + bulb */}
      <circle cx={cx - 8} cy={cy + 96} r="9" fill="none" stroke="#64748b" strokeWidth="3" />
      <circle cx={cx + 8} cy={cy + 96} r="9" fill="none" stroke="#64748b" strokeWidth="3" />
      <line x1={cx - 8} y1={cy + 50} x2={cx - 8} y2={cy + 87} stroke="#b45309" strokeWidth="3" />
      <line x1={cx + 8} y1={cy + 50} x2={cx + 8} y2={cy + 87} stroke="#b45309" strokeWidth="3" />
      <path d={`M ${cx - 8} ${cy + 105} L ${cx - 8} ${cy + 150} L ${cx - 40} ${cy + 150}`} fill="none" stroke="#334155" strokeWidth="2.5" />
      <path d={`M ${cx + 8} ${cy + 105} L ${cx + 8} ${cy + 150} L ${cx + 40} ${cy + 150}`} fill="none" stroke="#334155" strokeWidth="2.5" />
      {bulb(cx, cy + 150)}
      {showLabels && (
        <g>
          <Leader x={cx} y={cy - 50} tx={cx} ty={70} text="Coil rotated (mechanical input)" color="#16a34a" side="right" />
          <Leader x={cx} y={cy + 96} tx={70} ty={cy + 130} text="Slip rings + brushes" color="#64748b" side="left" />
          <text x={cx} y={cy + 180} fontSize="11" fill="#334155" textAnchor="middle">rotating coil induces a current (electromagnetic induction)</text>
        </g>
      )}
    </g>
  );
}

// ---- Food tests ------------------------------------------------------------
export function FoodTests({ showLabels = true }) {
  const tubes = [
    ["Starch", "iodine", "#1e3a8a", "blue-black"],
    ["Glucose", "Benedict's + heat", "#dc2626", "brick-red"],
    ["Protein", "Biuret", "#7c3aed", "purple/lilac"],
    ["Fat", "ethanol emulsion", "#e2e8f0", "cloudy white"],
  ];
  const cw = W / 4, top = 130, bot = 360;
  return (
    <g>
      {tubes.map(([food, reagent, color, result], i) => {
        const x = cw / 2 + i * cw;
        return (
          <g key={i}>
            <path d={`M ${x - 22} ${top} L ${x - 22} ${bot - 20} Q ${x - 22} ${bot} ${x} ${bot} Q ${x + 22} ${bot} ${x + 22} ${bot - 20} L ${x + 22} ${top}`} fill="none" stroke="#334155" strokeWidth="2.5" />
            <path d={`M ${x - 22} ${top + 70} L ${x - 22} ${bot - 20} Q ${x - 22} ${bot} ${x} ${bot} Q ${x + 22} ${bot} ${x + 22} ${bot - 20} L ${x + 22} ${top + 70} Z`} fill={color} opacity="0.7" />
            {showLabels && (
              <g textAnchor="middle">
                <text x={x} y={top - 26} fontSize="13" fontWeight="800" fill="#334155">{food}</text>
                <text x={x} y={top - 8} fontSize="10" fill="#64748b">{reagent}</text>
                <text x={x} y={bot + 24} fontSize="11" fontWeight="700" fill={color === "#e2e8f0" ? "#64748b" : color}>{result}</text>
              </g>
            )}
          </g>
        );
      })}
      {showLabels && <text x={W / 2} y={H - 24} fontSize="12" fill="#64748b" textAnchor="middle">positive-result colours for common food tests</text>}
    </g>
  );
}

// ---- Types of chemical reactions -------------------------------------------
export function ReactionTypes({ showLabels = true }) {
  const atom = (x, y, c, t) => <g><Sphere cx={x} cy={y} r={13} fill={c} /><text x={x} y={y + 4} fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">{t}</text></g>;
  const rows = [
    ["Combination", 110, "A + B → AB"], ["Decomposition", 220, "AB → A + B"],
    ["Displacement", 330, "A + BC → AC + B"], ["Double displacement", 440, "AB + CD → AD + CB"],
  ];
  const red = "#dc2626", blue = "#2563eb", green = "#16a34a", amber = "#f59e0b";
  return (
    <g>
      {rows.map(([name, y], i) => (
        <g key={i}>
          {showLabels && <text x={70} y={y + 4} fontSize="12.5" fontWeight="700" fill="#334155">{name}</text>}
          {i === 0 && <>{atom(300, y, red, "A")}<text x={332} y={y + 5} fontSize="16" textAnchor="middle">+</text>{atom(364, y, blue, "B")}<line x1={392} y1={y} x2={440} y2={y} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />{atom(474, y, red, "A")}{atom(500, y, blue, "B")}</>}
          {i === 1 && <>{atom(300, y, red, "A")}{atom(326, y, blue, "B")}<line x1={356} y1={y} x2={404} y2={y} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />{atom(438, y, red, "A")}<text x={470} y={y + 5} fontSize="16" textAnchor="middle">+</text>{atom(502, y, blue, "B")}</>}
          {i === 2 && <>{atom(300, y, green, "A")}<text x={332} y={y + 5} fontSize="16" textAnchor="middle">+</text>{atom(364, y, blue, "B")}{atom(390, y, amber, "C")}<line x1={420} y1={y} x2={460} y2={y} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />{atom(492, y, green, "A")}{atom(518, y, amber, "C")}<text x={548} y={y + 5} fontSize="16" textAnchor="middle">+</text>{atom(580, y, blue, "B")}</>}
          {i === 3 && <>{atom(288, y, red, "A")}{atom(314, y, blue, "B")}<text x={344} y={y + 5} fontSize="16" textAnchor="middle">+</text>{atom(374, y, green, "C")}{atom(400, y, amber, "D")}<line x1={430} y1={y} x2={466} y2={y} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />{atom(498, y, red, "A")}{atom(524, y, amber, "D")}<text x={554} y={y + 5} fontSize="16" textAnchor="middle">+</text>{atom(586, y, green, "C")}{atom(612, y, blue, "B")}</>}
        </g>
      ))}
    </g>
  );
}

// ---- Nuclear fission -------------------------------------------------------
export function NuclearFission({ showLabels = true }) {
  const nx = W / 2 - 60, ny = H / 2;
  return (
    <g>
      {/* incoming neutron */}
      <line x1={70} y1={ny} x2={nx - 46} y2={ny} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <circle cx={90} cy={ny} r="8" fill="#64748b" />
      {/* U-235 nucleus */}
      <g filter="url(#viz-shadow)"><Sphere cx={nx} cy={ny} r={44} fill="#7c3aed" /></g>
      {[...Array(10)].map((_, i) => { const a = i / 10 * 2 * Math.PI; return <circle key={i} cx={nx + 18 * Math.cos(a)} cy={ny + 18 * Math.sin(a)} r="6" fill={i % 2 ? "#c4b5fd" : "#a78bfa"} />; })}
      {/* two daughter nuclei */}
      <g filter="url(#viz-shadow)"><Sphere cx={W - 150} cy={ny - 70} r={26} fill="#16a34a" /></g>
      <g filter="url(#viz-shadow)"><Sphere cx={W - 130} cy={ny + 80} r={30} fill="#0891b2" /></g>
      <line x1={nx + 40} y1={ny - 10} x2={W - 180} y2={ny - 66} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />
      <line x1={nx + 40} y1={ny + 10} x2={W - 162} y2={ny + 74} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />
      {/* released neutrons + energy */}
      {[[-30, "#64748b"], [10, "#64748b"], [40, "#64748b"]].map(([dy, c], i) => <g key={i}><line x1={nx + 44} y1={ny} x2={nx + 150} y2={ny + dy} stroke={c} strokeWidth="1.6" markerEnd="url(#il-arrow)" /><circle cx={nx + 150} cy={ny + dy} r="6" fill={c} /></g>)}
      {showLabels && (
        <g>
          <text x={100} y={ny - 14} fontSize="11" fill="#334155">neutron</text>
          <Leader x={nx} y={ny + 44} tx={nx} ty={H - 24} text="U-235 nucleus" color="#7c3aed" side="right" />
          <text x={W - 150} y={ny - 100} fontSize="11" fill="#16a34a" textAnchor="middle">daughter nuclei</text>
          <text x={nx + 156} y={ny + 60} fontSize="11" fill="#334155">+ neutrons + energy</text>
          <text x={W / 2} y={40} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">Nuclear fission (chain reaction)</text>
        </g>
      )}
    </g>
  );
}

// ---- Cloud types -----------------------------------------------------------
export function CloudTypes({ showLabels = true }) {
  const ground = H - 50;
  const cloud = (cx, cy, s, fill = "#f1f5f9") => <g filter="url(#viz-shadow)">{[[-s, 0, s * 0.8], [0, -s * 0.4, s], [s, 0, s * 0.8]].map(([dx, dy, r], i) => <circle key={i} cx={cx + dx} cy={cy + dy} r={r} fill={fill} stroke="#cbd5e1" strokeWidth="1" />)}<rect x={cx - s * 1.6} y={cy} width={s * 3.2} height={s * 0.7} rx={s * 0.35} fill={fill} /></g>;
  return (
    <g>
      {/* Cirrus (high, wispy) */}
      {[0, 1, 2].map((i) => <path key={i} d={`M ${150 + i * 40} 90 q 40 -12 80 0`} fill="none" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />)}
      {/* Altocumulus (mid) */}
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={480 + i * 34} cy={190} r="16" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />)}
      {/* Stratus (low layer) */}
      <rect x={100} y={300} width={260} height={30} rx={15} fill="#cbd5e1" />
      {/* Cumulonimbus (towering, dark base) */}
      {cloud(560, 150, 30, "#f1f5f9")}
      <rect x={520} y={150} width={80} height={180} fill="#94a3b8" opacity="0.8" />
      {[...Array(5)].map((_, i) => <line key={i} x1={528 + i * 16} y1={330} x2={522 + i * 16} y2={360} stroke="#2563eb" strokeWidth="2" />)}
      {/* Ground */}
      <line x1={40} y1={ground} x2={W - 40} y2={ground} stroke="#16a34a" strokeWidth="4" />
      {showLabels && (
        <g fill="#334155">
          <text x={210} y={70} fontSize="12" fontWeight="700">Cirrus (high)</text>
          <text x={540} y={158} fontSize="12" fontWeight="700" textAnchor="middle">Altocumulus (mid)</text>
          <text x={230} y={356} fontSize="12" fontWeight="700" textAnchor="middle">Stratus (low)</text>
          <text x={560} y={130} fontSize="12" fontWeight="700" textAnchor="middle">Cumulonimbus</text>
        </g>
      )}
    </g>
  );
}


// ---- Xylem & phloem --------------------------------------------------------
export function XylemPhloem({ showLabels = true }) {
  const cx = W / 2, top = 110, bot = H - 90;
  return (
    <g>
      {/* xylem (left, water up) */}
      <rect x={cx - 90} y={top} width="60" height={bot - top} fill="#fee2e2" stroke="#dc2626" strokeWidth="2.5" />
      <line x1={cx - 60} y1={bot} x2={cx - 60} y2={top} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* phloem (right, sugars both ways) */}
      <rect x={cx + 30} y={top} width="60" height={bot - top} fill="#dbeafe" stroke="#2563eb" strokeWidth="2.5" />
      {[...Array(3)].map((_, i) => <circle key={i} cx={cx + 60} cy={top + 40 + i * 90} r="8" fill="none" stroke="#2563eb" strokeWidth="1.5" />)}
      <line x1={cx + 60} y1={top + 20} x2={cx + 60} y2={bot - 20} stroke="#2563eb" strokeWidth="2" strokeDasharray="6 4" markerStart="url(#il-arrow)" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <Leader x={cx - 60} y={top + 60} tx={70} ty={top + 40} text="Xylem — water & minerals ↑ (dead cells)" color="#dc2626" side="left" />
          <Leader x={cx + 60} y={top + 60} tx={W - 70} ty={top + 40} text="Phloem — sugars ↕ (living cells)" color="#2563eb" side="right" />
          <text x={cx} y={bot + 26} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">Plant transport tissues</text>
        </g>
      )}
    </g>
  );
}

// ---- Transpiration / stomata -----------------------------------------------
export function Transpiration({ showLabels = true }) {
  const cx = W / 2, cy = H / 2;
  return (
    <g>
      {/* leaf */}
      <path d={`M ${cx - 200} ${cy} Q ${cx} ${cy - 120} ${cx + 200} ${cy} Q ${cx} ${cy + 120} ${cx - 200} ${cy} Z`} fill="#bbf7d0" stroke="#16a34a" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <line x1={cx - 190} y1={cy} x2={cx + 190} y2={cy} stroke="#16a34a" strokeWidth="2" />
      {/* stoma (guard cells) at bottom */}
      <path d={`M ${cx - 20} ${cy + 96} q -10 14 0 28`} fill="none" stroke="#15803d" strokeWidth="6" />
      <path d={`M ${cx + 20} ${cy + 96} q 10 14 0 28`} fill="none" stroke="#15803d" strokeWidth="6" />
      {/* water vapour out */}
      {[-40, 0, 40].map((o, i) => <line key={i} x1={cx + o} y1={cy + 130} x2={cx + o} y2={cy + 180} stroke="#0ea5e9" strokeWidth="2.5" markerEnd="url(#il-arrow)" />)}
      {/* water in via xylem */}
      <line x1={cx - 120} y1={H - 30} x2={cx - 120} y2={cy + 20} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <Leader x={cx} y={cy + 110} tx={70} ty={cy + 140} text="Stoma & guard cells" color="#15803d" side="left" />
          <text x={cx} y={cy + 176} fontSize="11" fill="#0ea5e9" textAnchor="middle">water vapour lost (transpiration)</text>
          <text x={cx - 120} y={H - 12} fontSize="10.5" fill="#dc2626" textAnchor="middle">water in (xylem)</text>
        </g>
      )}
    </g>
  );
}

// ---- Types of teeth --------------------------------------------------------
export function TypesOfTeeth({ showLabels = true }) {
  const cx = W / 2, cy = H / 2 + 40, R = 240;
  const teeth = [
    ["Molar", -70], ["Premolar", -40], ["Canine", -18], ["Incisor", -4], ["Incisor", 4], ["Canine", 18], ["Premolar", 40], ["Molar", 70],
  ];
  const colors = { Incisor: "#2563eb", Canine: "#dc2626", Premolar: "#16a34a", Molar: "#f59e0b" };
  return (
    <g>
      <path d={`M ${cx - R} ${cy - 60} A ${R} ${R} 0 0 1 ${cx + R} ${cy - 60}`} fill="none" stroke="#e2e8f0" strokeWidth="2" />
      {teeth.map(([t, deg], i) => {
        const a = (-90 + deg) * Math.PI / 180, x = cx + R * Math.cos(a), y = (cy - 60) + R * Math.sin(a);
        return <g key={i}><rect x={x - 12} y={y - 14} width="24" height="28" rx="6" fill={colors[t]} stroke="#334155" strokeWidth="1" /></g>;
      })}
      {showLabels && (
        <g>
          <Leader x={cx} y={(cy - 60) - R + 14} tx={cx} ty={80} text="Incisor — cutting" color="#2563eb" side="right" />
          <Leader x={cx + R * Math.cos((-90 + 18) * Math.PI / 180)} y={(cy - 60) + R * Math.sin((-90 + 18) * Math.PI / 180)} tx={W - 70} ty={cy - 120} text="Canine — tearing" color="#dc2626" side="right" />
          <Leader x={cx + R * Math.cos((-90 + 40) * Math.PI / 180)} y={(cy - 60) + R * Math.sin((-90 + 40) * Math.PI / 180)} tx={W - 70} ty={cy} text="Premolar — crushing" color="#16a34a" side="right" />
          <Leader x={cx - R * Math.cos((-90 + 70) * Math.PI / 180) * -1} y={(cy - 60) + R * Math.sin((-90 + 70) * Math.PI / 180)} tx={70} ty={cy} text="Molar — grinding" color="#f59e0b" side="left" />
        </g>
      )}
    </g>
  );
}

// ---- Active vs passive transport -------------------------------------------
export function MembraneTransport({ showLabels = true }) {
  const bilayer = (x0, x1, y) => <g>{[y, y + 30].map((yy, r) => <g key={r}>{Array.from({ length: Math.floor((x1 - x0) / 16) }).map((_, i) => <g key={i}><circle cx={x0 + 8 + i * 16} cy={yy} r="6" fill="#fbbf24" /><line x1={x0 + 8 + i * 16} y1={yy + (r ? 6 : -6)} x2={x0 + 8 + i * 16} y2={yy + (r ? 20 : -20)} stroke="#f59e0b" strokeWidth="1.5" /></g>)}</g>)}</g>;
  const yMid = H / 2;
  return (
    <g>
      {/* Passive (left) */}
      {bilayer(60, W / 2 - 40, yMid)}
      <line x1={150} y1={yMid - 60} x2={150} y2={yMid + 90} stroke="#16a34a" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {[...Array(5)].map((_, i) => <circle key={i} cx={110 + (i % 3) * 20} cy={yMid - 40 - (i > 2 ? 20 : 0)} r="6" fill="#16a34a" />)}
      {/* Active (right) */}
      {bilayer(W / 2 + 40, W - 60, yMid)}
      <line x1={W - 150} y1={yMid + 90} x2={W - 150} y2={yMid - 60} stroke="#dc2626" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <rect x={W - 168} y={yMid - 4} width="36" height="38" rx="6" fill="#a78bfa" stroke="#7c3aed" strokeWidth="1.5" />
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={W / 4} y={80} fontSize="14" fontWeight="800" fill="#16a34a">Passive (diffusion)</text>
          <text x={W / 4} y={H - 40} fontSize="10.5" fill="#64748b">high → low · no energy</text>
          <text x={3 * W / 4} y={80} fontSize="14" fontWeight="800" fill="#dc2626">Active transport</text>
          <text x={3 * W / 4} y={H - 40} fontSize="10.5" fill="#64748b">low → high · needs ATP (pump)</text>
        </g>
      )}
    </g>
  );
}

// ---- Bacteria structure ----------------------------------------------------
export function BacteriaStructure({ showLabels = true }) {
  const cx = W / 2 - 20, cy = H / 2;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="200" ry="110" fill="#fef9c3" stroke="#ca8a04" strokeWidth="6" filter="url(#viz-shadow)" />
      <ellipse cx={cx} cy={cy} rx="188" ry="98" fill="#fffbeb" stroke="#f59e0b" strokeWidth="2" />
      {/* nucleoid (DNA loop) */}
      <path d={`M ${cx - 40} ${cy} q 40 -40 80 0 q -40 40 -80 0 Z`} fill="none" stroke="#2563eb" strokeWidth="3" />
      {/* plasmid */}
      <circle cx={cx - 110} cy={cy - 30} r="14" fill="none" stroke="#7c3aed" strokeWidth="3" />
      {/* ribosomes */}
      {[...Array(10)].map((_, i) => <circle key={i} cx={cx - 100 + (i % 5) * 44} cy={cy + 40 + Math.floor(i / 5) * 20} r="3.5" fill="#dc2626" />)}
      {/* flagellum */}
      <path d={`M ${cx + 200} ${cy} q 40 -14 60 6 q 20 20 50 6`} fill="none" stroke="#334155" strokeWidth="3" />
      {showLabels && (
        <g>
          <Leader x={cx} y={cy} tx={cx} ty={80} text="Nucleoid (DNA)" color="#2563eb" side="right" />
          <Leader x={cx - 110} y={cy - 30} tx={70} ty={cy - 90} text="Plasmid" color="#7c3aed" side="left" />
          <Leader x={cx - 100} y={cy + 40} tx={70} ty={cy + 90} text="Ribosomes" color="#dc2626" side="left" />
          <Leader x={cx + 180} y={cy - 60} tx={W - 70} ty={cy - 90} text="Cell wall" color="#ca8a04" side="right" />
          <Leader x={cx + 250} y={cy + 6} tx={W - 70} ty={cy + 90} text="Flagellum" color="#334155" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Virus structure (bacteriophage) ---------------------------------------
export function VirusStructure({ showLabels = true }) {
  const cx = W / 2, top = 100;
  return (
    <g>
      {/* head (icosahedral capsid) */}
      <polygon points={`${cx},${top} ${cx + 50},${top + 30} ${cx + 50},${top + 90} ${cx},${top + 120} ${cx - 50},${top + 90} ${cx - 50},${top + 30}`} fill="#c7d2fe" stroke="#4f46e5" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* genetic material inside */}
      <path d={`M ${cx - 20} ${top + 30} q 20 20 0 40 q -20 20 0 40`} fill="none" stroke="#dc2626" strokeWidth="2.5" />
      {/* collar + tail sheath */}
      <rect x={cx - 10} y={top + 120} width="20" height="70" fill="#a5b4fc" stroke="#4f46e5" strokeWidth="2" />
      {/* base plate + tail fibres */}
      <rect x={cx - 30} y={top + 190} width="60" height="12" rx="4" fill="#4f46e5" />
      {[-1, 1].map((d, i) => <path key={i} d={`M ${cx + d * 24} ${top + 202} q ${d * 20} 30 ${d * 6} 60`} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" />)}
      {showLabels && (
        <g>
          <Leader x={cx + 40} y={top + 30} tx={W - 70} ty={top + 20} text="Capsid (protein coat)" color="#4f46e5" side="right" />
          <Leader x={cx - 12} y={top + 70} tx={70} ty={top + 40} text="Genetic material (DNA)" color="#dc2626" side="left" />
          <Leader x={cx + 10} y={top + 155} tx={W - 70} ty={top + 150} text="Tail sheath" color="#4f46e5" side="right" />
          <Leader x={cx + 30} y={top + 250} tx={W - 70} ty={top + 250} text="Tail fibres" color="#4f46e5" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Seed dispersal --------------------------------------------------------
export function SeedDispersal({ showLabels = true }) {
  const y = H / 2, xs = [140, 350, 560];
  return (
    <g>
      {/* Wind (winged seed) */}
      <ellipse cx={xs[0]} cy={y} rx="10" ry="14" fill="#a16207" />
      <path d={`M ${xs[0] + 8} ${y - 6} q 40 -20 60 6 q -30 6 -60 -6`} fill="#bbf7d0" stroke="#16a34a" strokeWidth="1.5" />
      {/* Water (floating) */}
      <path d={`M ${xs[1] - 60} ${y + 30} q 30 -14 60 0 q 30 14 60 0`} fill="none" stroke="#0ea5e9" strokeWidth="3" />
      <ellipse cx={xs[1]} cy={y + 10} rx="26" ry="18" fill="#ca8a04" stroke="#78350f" strokeWidth="1.5" />
      {/* Animal (hooked burr) */}
      <circle cx={xs[2]} cy={y} r="20" fill="#78350f" />
      {[...Array(10)].map((_, i) => { const a = i / 10 * 2 * Math.PI; return <line key={i} x1={xs[2] + 20 * Math.cos(a)} y1={y + 20 * Math.sin(a)} x2={xs[2] + 30 * Math.cos(a)} y2={y + 30 * Math.sin(a)} stroke="#92400e" strokeWidth="2" />; })}
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={xs[0]} y={y + 70} fontSize="13" fontWeight="700">Wind</text>
          <text x={xs[0]} y={y + 86} fontSize="10" fill="#64748b">winged / parachute</text>
          <text x={xs[1]} y={y + 70} fontSize="13" fontWeight="700">Water</text>
          <text x={xs[1]} y={y + 86} fontSize="10" fill="#64748b">floats (buoyant)</text>
          <text x={xs[2]} y={y + 70} fontSize="13" fontWeight="700">Animal</text>
          <text x={xs[2]} y={y + 86} fontSize="10" fill="#64748b">hooks / eaten</text>
        </g>
      )}
    </g>
  );
}

// ---- Paper chromatography --------------------------------------------------
export function Chromatography({ showLabels = true }) {
  const cx = W / 2, top = 90, bot = H - 90;
  return (
    <g>
      {/* beaker */}
      <path d={`M ${cx - 120} ${top} L ${cx - 120} ${bot} Q ${cx - 120} ${bot + 26} ${cx - 94} ${bot + 26} L ${cx + 94} ${bot + 26} Q ${cx + 120} ${bot + 26} ${cx + 120} ${bot} L ${cx + 120} ${top}`} fill="none" stroke="#334155" strokeWidth="2.5" />
      {/* solvent */}
      <rect x={cx - 118} y={bot - 50} width="236" height="76" fill="#bae6fd" opacity="0.5" />
      {/* paper strip */}
      <rect x={cx - 24} y={top - 4} width="48" height={bot - top - 10} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
      {/* baseline + separated spots */}
      <line x1={cx - 24} y1={bot - 40} x2={cx + 24} y2={bot - 40} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
      {[["#dc2626", 90], ["#16a34a", 150], ["#2563eb", 210]].map(([c, up], i) => <circle key={i} cx={cx - 8 + i * 8} cy={bot - 40 - up} r="7" fill={c} />)}
      <circle cx={cx} cy={bot - 40} r="6" fill="#334155" />
      <line x1={cx - 40} y1={top + 40} x2={cx + 40} y2={top + 40} stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="4 3" />
      {showLabels && (
        <g>
          <Leader x={cx} y={bot - 40} tx={70} ty={bot - 20} text="baseline (sample spot)" color="#334155" side="left" />
          <Leader x={cx + 20} y={top + 40} tx={W - 70} ty={top + 30} text="solvent front" color="#7c3aed" side="right" />
          <text x={cx} y={bot + 44} fontSize="11" fill="#0284c7" textAnchor="middle">components separate by solubility (different Rf values)</text>
        </g>
      )}
    </g>
  );
}

// ---- Atomic structure ------------------------------------------------------
export function AtomicStructure({ showLabels = true }) {
  const cx = W / 2, cy = H / 2, shells = [2, 8, 3];
  return (
    <g>
      {shells.map((count, si) => {
        const r = 46 + (si + 1) * 46;
        return (
          <g key={si}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="2 4" />
            {Array.from({ length: count }).map((_, e) => { const a = e / count * 2 * Math.PI - Math.PI / 2; return <Sphere key={e} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={7} fill="#2563eb" stroke="#fff" strokeWidth={1.2} />; })}
          </g>
        );
      })}
      <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={34} fill="#334155" /></g>
      {[[-10, -6, "#dc2626"], [8, -8, "#3b82f6"], [-6, 8, "#dc2626"], [10, 6, "#3b82f6"], [0, 0, "#dc2626"]].map(([dx, dy, c], i) => <circle key={i} cx={cx + dx} cy={cy + dy} r="8" fill={c} />)}
      {showLabels && (
        <g>
          <Leader x={cx} y={cy - 34} tx={70} ty={90} text="Nucleus (protons + neutrons)" color="#334155" side="left" />
          <text x={cx - 10} y={cy - 2} fontSize="9" fill="#fff">p⁺</text>
          <Leader x={cx + 138} y={cy} tx={W - 70} ty={cy} text="Electrons (in shells)" color="#2563eb" side="right" />
        </g>
      )}
    </g>
  );
}


// ---- Isotopes --------------------------------------------------------------
export function Isotopes({ showLabels = true }) {
  const nucleus = (cx, cy, p, n) => (
    <g>
      <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={44} fill="#334155" /></g>
      {Array.from({ length: p + n }).map((_, i) => { const a = i / (p + n) * 2 * Math.PI; const r = 20 * Math.sqrt((i % 4 + 1) / 4); return <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r="6" fill={i < p ? "#ef4444" : "#3b82f6"} />; })}
      <circle cx={cx} cy={cy} r="70" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 4" />
      {[0, 1].map((k) => <circle key={k} cx={cx + 70 * Math.cos(k * Math.PI - Math.PI / 2)} cy={cy + 70 * Math.sin(k * Math.PI - Math.PI / 2)} r="6" fill="#2563eb" stroke="#fff" strokeWidth="1" />)}
    </g>
  );
  return (
    <g>
      {nucleus(W / 2 - 170, H / 2, 6, 6)}
      {nucleus(W / 2 + 170, H / 2, 6, 8)}
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={W / 2 - 170} y={H / 2 - 100} fontSize="16" fontWeight="800">Carbon-12</text>
          <text x={W / 2 - 170} y={H / 2 + 118} fontSize="11" fill="#64748b">6 protons, 6 neutrons</text>
          <text x={W / 2 + 170} y={H / 2 - 100} fontSize="16" fontWeight="800">Carbon-14</text>
          <text x={W / 2 + 170} y={H / 2 + 118} fontSize="11" fill="#64748b">6 protons, 8 neutrons</text>
          <text x={W / 2} y={H - 30} fontSize="12" fill="#334155">isotopes: same protons (red), different neutrons (blue)</text>
        </g>
      )}
    </g>
  );
}

// ---- Water treatment -------------------------------------------------------
export function WaterTreatment({ showLabels = true }) {
  const y = H / 2, stages = [["Screening", "#94a3b8"], ["Sedimentation", "#a16207"], ["Filtration", "#16a34a"], ["Chlorination", "#0891b2"], ["Clean water", "#38bdf8"]];
  const w = 118, gap = 22, x0 = (W - (stages.length * w + (stages.length - 1) * gap)) / 2;
  return (
    <g>
      {stages.map(([name, color], i) => {
        const x = x0 + i * (w + gap);
        return (
          <g key={i}>
            <rect x={x} y={y - 50} width={w} height="100" rx="10" fill="#f1f5f9" stroke={color} strokeWidth="2.5" filter="url(#viz-shadow)" />
            <rect x={x + 6} y={y} width={w - 12} height="44" fill={color} opacity="0.5" />
            {i < stages.length - 1 && <line x1={x + w} y1={y} x2={x + w + gap} y2={y} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />}
            {showLabels && <text x={x + w / 2} y={y + 76} fontSize="11" fontWeight="700" fill={color} textAnchor="middle">{name}</text>}
          </g>
        );
      })}
      {showLabels && <text x={W / 2} y={80} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Water treatment stages</text>}
    </g>
  );
}

// ---- Gears -----------------------------------------------------------------
export function Gears({ showLabels = true }) {
  const gear = (cx, cy, r, teeth, color, rot) => (
    <g>
      {Array.from({ length: teeth }).map((_, i) => { const a = i / teeth * 2 * Math.PI; return <rect key={i} x={cx - 5} y={cy - r - 10} width="10" height="14" fill={color} transform={`rotate(${a * 180 / Math.PI} ${cx} ${cy})`} />; })}
      <circle cx={cx} cy={cy} r={r} fill={color} stroke="#334155" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.3} fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
      <path d={`M ${cx - r * 0.6} ${cy - r * 0.6} A ${r * 0.85} ${r * 0.85} 0 0 ${rot > 0 ? 1 : 0} ${cx + r * 0.6} ${cy - r * 0.6}`} fill="none" stroke="#f8fafc" strokeWidth="2" markerEnd="url(#il-arrow)" />
    </g>
  );
  return (
    <g>
      {gear(W / 2 - 90, H / 2, 80, 16, "#64748b", 1)}
      {gear(W / 2 + 90, H / 2 - 30, 50, 10, "#0891b2", -1)}
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={W / 2 - 90} y={H / 2 + 130} fontSize="12" fontWeight="700">Driver gear (large)</text>
          <text x={W / 2 + 90} y={H / 2 - 100} fontSize="12" fontWeight="700">Driven gear (small)</text>
          <text x={W / 2} y={H - 30} fontSize="11" fill="#64748b">meshing gears turn in opposite directions; small gear spins faster</text>
        </g>
      )}
    </g>
  );
}

// ---- Ohm's law -------------------------------------------------------------
export function OhmsLaw({ showLabels = true }) {
  const cx = W / 2, cy = H / 2, s = 150;
  return (
    <g>
      <path d={`M ${cx} ${cy - s} L ${cx - s} ${cy + s * 0.7} L ${cx + s} ${cy + s * 0.7} Z`} fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" filter="url(#viz-shadow)" />
      <line x1={cx - s * 0.72} y1={cy + s * 0.06} x2={cx + s * 0.72} y2={cy + s * 0.06} stroke="#0284c7" strokeWidth="2.5" />
      <text x={cx} y={cy - s * 0.3} fontSize="40" fontWeight="800" fill="#dc2626" textAnchor="middle">V</text>
      <text x={cx - s * 0.4} y={cy + s * 0.56} fontSize="34" fontWeight="800" fill="#16a34a" textAnchor="middle">I</text>
      <text x={cx + s * 0.4} y={cy + s * 0.56} fontSize="34" fontWeight="800" fill="#7c3aed" textAnchor="middle">R</text>
      {showLabels && (
        <g fill="#334155" textAnchor="middle">
          <text x={cx} y={cy + s + 40} fontSize="15" fontWeight="700">V = I × R</text>
          <text x={cx} y={cy + s + 62} fontSize="11" fill="#64748b">V = voltage · I = current · R = resistance</text>
        </g>
      )}
    </g>
  );
}

// ---- Total internal reflection / optical fibre -----------------------------
export function TotalInternalReflection({ showLabels = true }) {
  const y = H / 2;
  return (
    <g>
      {/* optical fibre core */}
      <rect x={80} y={y - 40} width={W - 160} height="80" rx="40" fill="#dbeafe" stroke="#0284c7" strokeWidth="2.5" />
      {/* bouncing ray */}
      <polyline points={`110,${y + 30} 220,${y - 30} 330,${y + 30} 440,${y - 30} 550,${y + 30} ${W - 100},${y - 30}`} fill="none" stroke="#f59e0b" strokeWidth="3" />
      {[220, 440].map((x, i) => <line key={i} x1={x} y1={y - 40} x2={x} y2={y - 60} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3" />)}
      {showLabels && (
        <g fill="#334155" textAnchor="middle">
          <text x={W / 2} y={80} fontSize="14" fontWeight="800">Total internal reflection (optical fibre)</text>
          <text x={220} y={y - 66} fontSize="10" fill="#64748b">angle &gt; critical angle → reflects</text>
          <text x={W / 2} y={H - 40} fontSize="11" fill="#f59e0b">light stays trapped, bouncing along the core</text>
        </g>
      )}
    </g>
  );
}

// ---- Nuclear fusion --------------------------------------------------------
export function NuclearFusion({ showLabels = true }) {
  const cx = W / 2, cy = H / 2;
  const smallNuc = (x, y, label, c) => <g><g filter="url(#viz-shadow)"><Sphere cx={x} cy={y} r={26} fill={c} /></g>{showLabels && <text x={x} y={y + 46} fontSize="11" fill="#334155" textAnchor="middle">{label}</text>}</g>;
  return (
    <g>
      {smallNuc(150, cy - 60, "Deuterium (²H)", "#2563eb")}
      {smallNuc(150, cy + 60, "Tritium (³H)", "#16a34a")}
      <line x1={186} y1={cy - 50} x2={cx - 40} y2={cy - 10} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <line x1={186} y1={cy + 50} x2={cx - 40} y2={cy + 10} stroke="#334155" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <g filter="url(#viz-shadow)"><Sphere cx={cx + 40} cy={cy} r={38} fill="#7c3aed" /></g>
      <line x1={cx + 80} y1={cy - 20} x2={W - 110} y2={cy - 60} stroke="#64748b" strokeWidth="2" markerEnd="url(#il-arrow)" />
      <circle cx={W - 110} cy={cy - 60} r="8" fill="#64748b" />
      {showLabels && (
        <g fill="#334155">
          <text x={cx + 40} y={cy + 60} fontSize="11" textAnchor="middle">Helium (⁴He)</text>
          <text x={W - 130} y={cy - 74} fontSize="11">neutron</text>
          <text x={cx + 120} y={cy + 30} fontSize="11" fill="#dc2626">+ huge energy</text>
          <text x={W / 2} y={70} fontSize="14" fontWeight="800" textAnchor="middle">Nuclear fusion (powers the Sun)</text>
        </g>
      )}
    </g>
  );
}

// ---- Circuit symbols legend ------------------------------------------------
export function CircuitSymbols({ showLabels = true }) {
  const items = [
    ["Cell", (x, y) => <g stroke="#334155" strokeWidth="2.5"><line x1={x - 6} y1={y - 12} x2={x - 6} y2={y + 12} /><line x1={x + 6} y1={y - 7} x2={x + 6} y2={y + 7} /></g>],
    ["Battery", (x, y) => <g stroke="#334155" strokeWidth="2.5"><line x1={x - 12} y1={y - 12} x2={x - 12} y2={y + 12} /><line x1={x - 2} y1={y - 7} x2={x - 2} y2={y + 7} /><line x1={x + 6} y1={y - 12} x2={x + 6} y2={y + 12} /><line x1={x + 14} y1={y - 7} x2={x + 14} y2={y + 7} /></g>],
    ["Bulb", (x, y) => <g stroke="#334155" strokeWidth="2.5" fill="none"><circle cx={x} cy={y} r="14" /><line x1={x - 10} y1={y - 10} x2={x + 10} y2={y + 10} /><line x1={x - 10} y1={y + 10} x2={x + 10} y2={y - 10} /></g>],
    ["Resistor", (x, y) => <rect x={x - 20} y={y - 8} width="40" height="16" fill="none" stroke="#334155" strokeWidth="2.5" />],
    ["Switch", (x, y) => <g stroke="#334155" strokeWidth="2.5"><circle cx={x - 16} cy={y} r="3" fill="#334155" /><line x1={x - 16} y1={y} x2={x + 14} y2={y - 14} /><circle cx={x + 16} cy={y} r="3" fill="#334155" /></g>],
    ["Ammeter", (x, y) => <g stroke="#334155" strokeWidth="2.5" fill="none"><circle cx={x} cy={y} r="14" /><text x={x} y={y + 5} fontSize="14" fontWeight="700" fill="#334155" textAnchor="middle" stroke="none">A</text></g>],
    ["Voltmeter", (x, y) => <g stroke="#334155" strokeWidth="2.5" fill="none"><circle cx={x} cy={y} r="14" /><text x={x} y={y + 5} fontSize="14" fontWeight="700" fill="#334155" textAnchor="middle" stroke="none">V</text></g>],
    ["Fuse", (x, y) => <g stroke="#334155" strokeWidth="2.5" fill="none"><rect x={x - 20} y={y - 8} width="40" height="16" /><line x1={x - 20} y1={y} x2={x + 20} y2={y} /></g>],
  ];
  const cols = 4, cw = W / cols, rh = 150, y0 = 130;
  return (
    <g>
      {items.map(([name, draw], i) => {
        const x = (i % cols) * cw + cw / 2, y = y0 + Math.floor(i / cols) * rh;
        return <g key={i}>{draw(x, y)}{showLabels && <text x={x} y={y + 40} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">{name}</text>}</g>;
      })}
      {showLabels && <text x={W / 2} y={70} fontSize="14" fontWeight="800" fill="#334155" textAnchor="middle">Circuit symbols</text>}
    </g>
  );
}

// ---- Ozone layer -----------------------------------------------------------
export function OzoneLayer({ showLabels = true }) {
  const ground = H - 50, ozY = 190;
  return (
    <g>
      <rect x={40} y={60} width={W - 80} height={ground - 60} fill="#dbeafe" opacity="0.4" />
      {/* ozone band */}
      <rect x={40} y={ozY - 24} width={W - 80} height="48" rx="20" fill="#a5b4fc" opacity="0.7" stroke="#6366f1" strokeWidth="1.5" />
      {/* sun + UV */}
      <g filter="url(#viz-shadow)"><Sphere cx={110} cy={100} r={28} fill="#fbbf24" /></g>
      {[0, 1, 2].map((i) => <line key={i} x1={140 + i * 30} y1={120} x2={220 + i * 30} y2={ozY - 26} stroke="#7c3aed" strokeWidth="2.5" markerEnd="url(#il-arrow)" />)}
      {/* most UV reflected/absorbed; little passes */}
      <line x1={300} y1={ozY + 24} x2={330} y2={ground - 10} stroke="#7c3aed" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#il-arrow)" />
      {/* ground */}
      <path d={`M 40 ${ground} Q ${W / 2} ${ground - 20} ${W - 40} ${ground} L ${W - 40} ${H - 20} L 40 ${H - 20} Z`} fill="#16a34a" stroke="#15803d" strokeWidth="2" />
      {showLabels && (
        <g fill="#334155">
          <Leader x={W - 120} y={ozY} tx={W - 60} ty={ozY} text="Ozone layer (stratosphere)" color="#6366f1" side="right" />
          <text x={200} y={150} fontSize="11" fill="#7c3aed">UV radiation</text>
          <text x={W / 2} y={ground + 22} fontSize="11" fill="#64748b" textAnchor="middle">ozone absorbs most harmful UV</text>
        </g>
      )}
    </g>
  );
}

// ---- Volcano types ---------------------------------------------------------
export function VolcanoTypes({ showLabels = true }) {
  const ground = H - 90;
  return (
    <g>
      {/* Shield volcano (broad, gentle) */}
      <path d={`M 60 ${ground} Q 210 ${ground - 90} 360 ${ground} Z`} fill="#a16207" stroke="#7c2d12" strokeWidth="2.5" filter="url(#viz-shadow)" />
      <path d={`M 210 ${ground - 84} l -8 -20 l 16 0 z`} fill="#ef4444" />
      {/* Composite / stratovolcano (steep, layered) */}
      <path d={`M 440 ${ground} L 560 ${ground - 190} L 680 ${ground} Z`} fill="#78716c" stroke="#44403c" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {[0.3, 0.55, 0.8].map((t, i) => <path key={i} d={`M ${440 + t * 60} ${ground - t * 190} L ${680 - t * 60} ${ground - t * 190}`} stroke="#57534e" strokeWidth="1.5" opacity="0.6" />)}
      {[[560, ground - 200, 26]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#9ca3af" />)}
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={210} y={ground + 30} fontSize="13" fontWeight="700">Shield volcano</text>
          <text x={210} y={ground + 46} fontSize="10" fill="#64748b">broad, gentle · runny lava</text>
          <text x={560} y={ground + 30} fontSize="13" fontWeight="700">Composite (strato)</text>
          <text x={560} y={ground + 46} fontSize="10" fill="#64748b">steep, layered · explosive</text>
        </g>
      )}
    </g>
  );
}


// ---- Alveoli gas exchange --------------------------------------------------
export function Alveoli({ showLabels = true }) {
  const cx = W / 2 - 40, cy = H / 2;
  return (
    <g>
      {/* alveolus */}
      <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={90} fill="#fecdd3" /></g>
      <circle cx={cx} cy={cy} r={80} fill="#fff1f2" stroke="#e11d48" strokeWidth="2" />
      {/* capillary wrapping */}
      <path d={`M ${cx + 80} ${cy - 70} Q ${cx + 150} ${cy} ${cx + 80} ${cy + 70}`} fill="none" stroke="#dc2626" strokeWidth="14" />
      <path d={`M ${cx + 80} ${cy - 70} Q ${cx + 130} ${cy} ${cx + 80} ${cy + 70}`} fill="none" stroke="#2563eb" strokeWidth="6" opacity="0.6" />
      {/* gas exchange arrows */}
      <line x1={cx + 60} y1={cy - 20} x2={cx + 96} y2={cy - 20} stroke="#dc2626" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <line x1={cx + 96} y1={cy + 20} x2={cx + 60} y2={cy + 20} stroke="#2563eb" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g>
          <Leader x={cx} y={cy} tx={70} ty={cy} text="Alveolus (thin, moist wall)" color="#e11d48" side="left" />
          <Leader x={cx + 120} y={cy} tx={W - 60} ty={cy - 80} text="Capillary" color="#dc2626" side="right" />
          <text x={cx + 108} y={cy - 26} fontSize="10.5" fill="#dc2626">O₂ →</text>
          <text x={cx + 44} y={cy + 40} fontSize="10.5" fill="#2563eb">← CO₂</text>
        </g>
      )}
    </g>
  );
}

// ---- Villi (intestinal absorption) -----------------------------------------
export function Villi({ showLabels = true }) {
  const baseY = H / 2 + 80, x0 = 120, x1 = W - 120;
  return (
    <g>
      <path d={`M ${x0} ${baseY} ${Array.from({ length: 7 }).map((_, i) => { const x = x0 + 30 + i * ((x1 - x0 - 60) / 6); return `Q ${x - 20} ${baseY - 130} ${x} ${baseY - 130} Q ${x + 20} ${baseY - 130} ${x + 20} ${baseY}`; }).join(" ")} L ${x1} ${baseY} Z`} fill="#fecdd3" stroke="#e11d48" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* capillary network + lacteal inside one villus */}
      <path d={`M ${x0 + 130} ${baseY} q -6 -90 0 -120`} fill="none" stroke="#dc2626" strokeWidth="3" />
      <path d={`M ${x0 + 150} ${baseY} q 6 -90 0 -120`} fill="none" stroke="#2563eb" strokeWidth="3" />
      <path d={`M ${x0 + 140} ${baseY} v -110`} fill="none" stroke="#f59e0b" strokeWidth="3" />
      {/* nutrient arrows */}
      {[...Array(4)].map((_, i) => <line key={i} x1={x0 + 60 + i * 120} y1={baseY - 150} x2={x0 + 60 + i * 120} y2={baseY - 120} stroke="#16a34a" strokeWidth="2" markerEnd="url(#il-arrow)" />)}
      {showLabels && (
        <g>
          <Leader x={x0 + 90} y={baseY - 90} tx={70} ty={baseY - 110} text="Villus (large surface area)" color="#e11d48" side="left" />
          <Leader x={x0 + 140} y={baseY - 60} tx={W - 60} ty={baseY - 90} text="Capillaries + lacteal" color="#dc2626" side="right" />
          <text x={W / 2} y={80} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">Villi — nutrient absorption in the small intestine</text>
        </g>
      )}
    </g>
  );
}

// ---- Specialized cells -----------------------------------------------------
export function SpecializedCells({ showLabels = true }) {
  const y = H / 2, xs = [130, 320, 520, 680];
  return (
    <g>
      {/* red blood cell */}
      <ellipse cx={xs[0]} cy={y} rx="40" ry="26" fill="#fca5a5" stroke="#dc2626" strokeWidth="2" />
      <ellipse cx={xs[0]} cy={y} rx="16" ry="10" fill="#f87171" />
      {/* nerve cell */}
      <Sphere cx={xs[1] - 20} cy={y} r={20} fill="#c7d2fe" />
      <line x1={xs[1]} y1={y} x2={xs[1] + 70} y2={y} stroke="#4f46e5" strokeWidth="4" />
      {[[-1, -1], [-1, 1]].map(([a, b], i) => <line key={i} x1={xs[1] - 20} y1={y} x2={xs[1] - 20 + a * 24} y2={y + b * 22} stroke="#4f46e5" strokeWidth="2.5" />)}
      {/* sperm cell */}
      <ellipse cx={xs[2] - 30} cy={y} rx="16" ry="12" fill="#a78bfa" stroke="#7c3aed" strokeWidth="1.5" />
      <path d={`M ${xs[2] - 14} ${y} q 40 -16 70 0 q -40 16 -70 0`} fill="none" stroke="#7c3aed" strokeWidth="2" />
      {/* root hair cell */}
      <rect x={xs[3] - 30} y={y - 24} width="60" height="48" fill="#bbf7d0" stroke="#16a34a" strokeWidth="2" />
      <line x1={xs[3] - 30} y1={y} x2={xs[3] - 70} y2={y} stroke="#16a34a" strokeWidth="4" />
      {showLabels && (
        <g textAnchor="middle" fill="#334155" fontSize="11">
          <text x={xs[0]} y={y + 50} fontWeight="700">Red blood cell</text>
          <text x={xs[1]} y={y + 50} fontWeight="700">Nerve cell</text>
          <text x={xs[2]} y={y + 50} fontWeight="700">Sperm cell</text>
          <text x={xs[3]} y={y + 50} fontWeight="700">Root hair cell</text>
        </g>
      )}
    </g>
  );
}

// ---- Types of muscle -------------------------------------------------------
export function MuscleTypes({ showLabels = true }) {
  const y = H / 2, xs = [W / 6, W / 2, 5 * W / 6];
  return (
    <g>
      {/* skeletal — long striated fibres */}
      {[...Array(4)].map((_, i) => <g key={i}><rect x={xs[0] - 70} y={y - 40 + i * 22} width="140" height="16" rx="8" fill="#fca5a5" stroke="#dc2626" strokeWidth="1.2" />{[...Array(6)].map((_, k) => <line key={k} x1={xs[0] - 60 + k * 24} y1={y - 40 + i * 22} x2={xs[0] - 60 + k * 24} y2={y - 24 + i * 22} stroke="#b91c1c" strokeWidth="1" />)}</g>)}
      {/* cardiac — branched striated */}
      {[...Array(3)].map((_, i) => <path key={i} d={`M ${xs[1] - 70} ${y - 30 + i * 30} h 60 l 20 20 h 60`} fill="none" stroke="#e11d48" strokeWidth="8" strokeLinecap="round" />)}
      {/* smooth — spindle cells */}
      {[...Array(6)].map((_, i) => <ellipse key={i} cx={xs[2] - 50 + (i % 3) * 50} cy={y - 20 + Math.floor(i / 3) * 40} rx="26" ry="10" fill="#c7d2fe" stroke="#4f46e5" strokeWidth="1.5" />)}
      {showLabels && (
        <g textAnchor="middle" fill="#334155" fontSize="12">
          <text x={xs[0]} y={y + 60} fontWeight="700">Skeletal</text><text x={xs[0]} y={y + 76} fontSize="9.5" fill="#64748b">striated, voluntary</text>
          <text x={xs[1]} y={y + 60} fontWeight="700">Cardiac</text><text x={xs[1]} y={y + 76} fontSize="9.5" fill="#64748b">branched, in heart</text>
          <text x={xs[2]} y={y + 60} fontWeight="700">Smooth</text><text x={xs[2]} y={y + 76} fontSize="9.5" fill="#64748b">spindle, involuntary</text>
        </g>
      )}
    </g>
  );
}

// ---- Blood vessels ---------------------------------------------------------
export function BloodVessels({ showLabels = true }) {
  const y = H / 2, xs = [W / 6 + 20, W / 2, 5 * W / 6 - 20];
  const vessel = (cx, rOut, rIn, wall, label, sub) => (
    <g>
      <circle cx={cx} cy={y} r={rOut} fill="#fecaca" stroke="#dc2626" strokeWidth={wall} />
      <circle cx={cx} cy={y} r={rIn} fill="#fff" />
      {showLabels && <><text x={cx} y={y + rOut + 26} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">{label}</text><text x={cx} y={y + rOut + 42} fontSize="9.5" fill="#64748b" textAnchor="middle">{sub}</text></>}
    </g>
  );
  return (
    <g>
      {vessel(xs[0], 60, 24, 14, "Artery", "thick wall, small lumen")}
      {vessel(xs[1], 60, 44, 5, "Vein", "thin wall, large lumen")}
      {/* capillary — single cell wall */}
      <circle cx={xs[2]} cy={y} r={40} fill="#fff" stroke="#dc2626" strokeWidth="2" />
      {showLabels && <><text x={xs[2]} y={y + 66} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Capillary</text><text x={xs[2]} y={y + 82} fontSize="9.5" fill="#64748b" textAnchor="middle">one-cell-thick wall</text></>}
    </g>
  );
}

// ---- Reactivity series -----------------------------------------------------
export function ReactivitySeries({ showLabels = true }) {
  const metals = ["Potassium (K)", "Sodium (Na)", "Calcium (Ca)", "Magnesium (Mg)", "Aluminium (Al)", "Zinc (Zn)", "Iron (Fe)", "Copper (Cu)", "Silver (Ag)", "Gold (Au)"];
  const x = W / 2, top = 70, step = 40;
  return (
    <g>
      <line x1={x - 150} y1={top - 10} x2={x - 150} y2={top + metals.length * step} stroke="#334155" strokeWidth="3" markerStart="url(#il-arrow)" markerEnd="url(#il-arrow)" />
      {metals.map((m, i) => {
        const y = top + i * step;
        const c = `hsl(${120 - i * 12}, 70%, 55%)`;
        return <g key={i}><rect x={x - 130} y={y} width="260" height="30" rx="6" fill={c} opacity="0.85" /><text x={x} y={y + 20} fontSize="13" fontWeight="700" fill="#fff" textAnchor="middle">{m}</text></g>;
      })}
      {showLabels && (
        <g fill="#334155">
          <text x={x - 160} y={top + 6} fontSize="11" textAnchor="end">most reactive</text>
          <text x={x - 160} y={top + metals.length * step - 6} fontSize="11" textAnchor="end">least reactive</text>
        </g>
      )}
    </g>
  );
}

// ---- Rusting (conditions) --------------------------------------------------
export function Rusting({ showLabels = true }) {
  const tubes = [["Water + air", true], ["Boiled water\n(no air)", false], ["Dry air\n(no water)", false]];
  const cw = W / 3, top = 120, bot = 340;
  return (
    <g>
      {tubes.map(([label, rusts], i) => {
        const x = cw / 2 + i * cw;
        return (
          <g key={i}>
            <path d={`M ${x - 26} ${top} L ${x - 26} ${bot - 20} Q ${x - 26} ${bot} ${x} ${bot} Q ${x + 26} ${bot} ${x + 26} ${bot - 20} L ${x + 26} ${top}`} fill="none" stroke="#334155" strokeWidth="2.5" />
            {i === 0 && <path d={`M ${x - 26} ${top + 60} L ${x - 26} ${bot - 20} Q ${x - 26} ${bot} ${x} ${bot} Q ${x + 26} ${bot} ${x + 26} ${bot - 20} L ${x + 26} ${top + 60} Z`} fill="#bae6fd" opacity="0.5" />}
            <rect x={x - 8} y={bot - 70} width="16" height="50" fill={rusts ? "#b45309" : "#94a3b8"} />
            {rusts && [...Array(6)].map((_, k) => <circle key={k} cx={x - 6 + (k % 2) * 12} cy={bot - 60 + k * 8} r="2.5" fill="#7c2d12" />)}
            {showLabels && (
              <g textAnchor="middle">
                <text x={x} y={bot + 26} fontSize="11" fontWeight="700" fill="#334155">{label.split("\n")[0]}</text>
                {label.split("\n")[1] && <text x={x} y={bot + 42} fontSize="10" fill="#64748b">{label.split("\n")[1]}</text>}
                <text x={x} y={bot + 62} fontSize="11" fontWeight="700" fill={rusts ? "#b45309" : "#16a34a"}>{rusts ? "RUSTS" : "no rust"}</text>
              </g>
            )}
          </g>
        );
      })}
      {showLabels && <text x={W / 2} y={70} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Rusting needs both water AND oxygen</text>}
    </g>
  );
}

// ---- Separating mixtures ---------------------------------------------------
export function SeparatingMixtures({ showLabels = true }) {
  return (
    <g>
      {/* Filtration (left) */}
      <path d="M 90 120 L 150 200 L 130 200 L 130 260 L 110 260 L 110 200 Z" fill="#e2e8f0" stroke="#334155" strokeWidth="2" />
      <path d="M 90 120 L 210 120 L 150 200 Z" fill="none" stroke="#334155" strokeWidth="2" />
      <path d="M 100 300 L 100 350 Q 100 366 116 366 L 184 366 Q 200 366 200 350 L 200 300" fill="none" stroke="#334155" strokeWidth="2" />
      <line x1={120} y1={266} x2={120} y2={300} stroke="#0ea5e9" strokeWidth="3" strokeDasharray="4 3" />
      {showLabels && <text x={150} y={H - 30} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">Filtration</text>}
      {/* Evaporation (middle) */}
      <path d="M 340 300 Q 340 340 380 340 L 420 340 Q 460 340 460 300" fill="#bae6fd" fillOpacity="0.5" stroke="#334155" strokeWidth="2" />
      {[-10, 0, 10].map((o, i) => <path key={i} d={`M ${400 + o} 300 q 6 -20 0 -40`} fill="none" stroke="#94a3b8" strokeWidth="2" />)}
      <path d="M 384 356 q 8 -16 16 0 q 8 16 16 0" fill="none" stroke="#f97316" strokeWidth="3" />
      {showLabels && <text x={400} y={H - 30} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">Evaporation</text>}
      {/* Crystallization (right) */}
      <path d="M 600 300 Q 600 340 640 340 L 680 340 Q 720 340 720 300" fill="#dbeafe" fillOpacity="0.5" stroke="#334155" strokeWidth="2" />
      {[[630, 320], [660, 328], [690, 322]].map(([x, y], i) => <rect key={i} x={x - 6} y={y - 6} width="12" height="12" fill="#7c3aed" transform={`rotate(45 ${x} ${y})`} />)}
      {showLabels && <text x={660} y={H - 30} fontSize="12" fontWeight="700" fill="#334155" textAnchor="middle">Crystallization</text>}
      {showLabels && <text x={W / 2} y={70} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Separating mixtures</text>}
    </g>
  );
}

// ---- Endothermic vs exothermic ---------------------------------------------
export function Energetics({ showLabels = true }) {
  const draw = (x0, exo) => {
    const bottom = H - 120, top = 150, left = x0, right = x0 + 260;
    const rY = exo ? top + 20 : bottom - 20, pY = exo ? bottom - 20 : top + 20;
    return (
      <g>
        <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="currentColor" strokeWidth="1.5" />
        <line x1={left} y1={bottom} x2={left} y2={top - 10} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#il-arrow)" />
        <path d={`M ${left + 20} ${rY} L ${left + 90} ${rY} Q ${left + 130} ${exo ? top - 30 : bottom + 30} ${left + 170} ${(rY + pY) / 2} Q ${left + 200} ${pY - (exo ? -20 : 20)} ${left + 240} ${pY}`} fill="none" stroke={exo ? "#dc2626" : "#2563eb"} strokeWidth="3" />
        {showLabels && (
          <g textAnchor="middle" fill="#334155">
            <text x={left + 130} y={top - 30} fontSize="13" fontWeight="800" fill={exo ? "#dc2626" : "#2563eb"}>{exo ? "Exothermic" : "Endothermic"}</text>
            <text x={left + 130} y={bottom + 24} fontSize="10" fill="#64748b">progress of reaction →</text>
            <text x={left + 200} y={pY + (exo ? 18 : -8)} fontSize="10" fill="#64748b">{exo ? "products lower (ΔH<0)" : "products higher (ΔH>0)"}</text>
          </g>
        )}
      </g>
    );
  };
  return <g>{draw(70, true)}{draw(W / 2 + 20, false)}</g>;
}


// ---- Heat transfer (conduction / convection / radiation) -------------------
export function HeatTransfer({ showLabels = true }) {
  const y = H / 2, xs = [W / 6, W / 2, 5 * W / 6];
  return (
    <g>
      {/* conduction: heated rod */}
      <rect x={xs[0] - 70} y={y - 12} width="140" height="24" rx="6" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
      <path d={`M ${xs[0] - 70} ${y + 20} q 8 -16 16 0 q 8 16 16 0`} fill="none" stroke="#f97316" strokeWidth="3" />
      {[...Array(5)].map((_, i) => <line key={i} x1={xs[0] - 60 + i * 24} y1={y} x2={xs[0] - 48 + i * 24} y2={y} stroke="#dc2626" strokeWidth="2" markerEnd="url(#il-arrow)" />)}
      {/* convection: beaker current */}
      <path d={`M ${xs[1] - 40} ${y - 40} L ${xs[1] - 40} ${y + 40} Q ${xs[1] - 40} ${y + 54} ${xs[1] - 26} ${y + 54} L ${xs[1] + 26} ${y + 54} Q ${xs[1] + 40} ${y + 54} ${xs[1] + 40} ${y + 40} L ${xs[1] + 40} ${y - 40}`} fill="#bae6fd" fillOpacity="0.5" stroke="#334155" strokeWidth="2" />
      <path d={`M ${xs[1] - 20} ${y + 40} q -20 -40 0 -70 q 20 -20 20 10 q 0 30 -20 60`} fill="none" stroke="#dc2626" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <path d={`M ${xs[1] + 20} ${y - 20} q 20 40 0 60 q -20 20 -20 -10` } fill="none" stroke="#2563eb" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <path d={`M ${xs[1] - 8} ${y + 66} q 8 -14 16 0`} fill="none" stroke="#f97316" strokeWidth="3" />
      {/* radiation: source emitting waves */}
      <g filter="url(#viz-shadow)"><Sphere cx={xs[2] - 40} cy={y} r={22} fill="#fbbf24" /></g>
      {[0, 1, 2].map((i) => <path key={i} d={`M ${xs[2]} ${y - 20 + i * 20} q 12 -8 24 0 q 12 8 24 0`} fill="none" stroke="#dc2626" strokeWidth="2" />)}
      {showLabels && (
        <g textAnchor="middle" fill="#334155" fontSize="12" fontWeight="700">
          <text x={xs[0]} y={y + 70}>Conduction</text><text x={xs[1]} y={y + 92}>Convection</text><text x={xs[2]} y={y + 70}>Radiation</text>
        </g>
      )}
    </g>
  );
}

// ---- Newton's cradle -------------------------------------------------------
export function NewtonsCradle({ showLabels = true }) {
  const topY = 110, r = 24, n = 5, x0 = W / 2 - (n - 1) * r, by = topY + 200;
  return (
    <g>
      <line x1={W / 2 - 150} y1={topY} x2={W / 2 + 150} y2={topY} stroke="#334155" strokeWidth="6" strokeLinecap="round" />
      {/* raised ball on left */}
      <line x1={x0} y1={topY} x2={x0 - 60} y2={by - 40} stroke="#64748b" strokeWidth="1.5" />
      <g filter="url(#viz-shadow)"><Sphere cx={x0 - 60} cy={by - 40} r={r} fill="#94a3b8" /></g>
      {/* middle stationary balls */}
      {[1, 2, 3].map((i) => <g key={i}><line x1={x0 + i * 2 * r} y1={topY} x2={x0 + i * 2 * r} y2={by} stroke="#64748b" strokeWidth="1.5" /><Sphere cx={x0 + i * 2 * r} cy={by} r={r} fill="#94a3b8" /></g>)}
      {/* flying ball on right */}
      <line x1={x0 + 4 * 2 * r} y1={topY} x2={x0 + 4 * 2 * r + 60} y2={by - 40} stroke="#64748b" strokeWidth="1.5" />
      <g filter="url(#viz-shadow)"><Sphere cx={x0 + 4 * 2 * r + 60} cy={by - 40} r={r} fill="#94a3b8" /></g>
      {showLabels && (
        <g fill="#334155" textAnchor="middle">
          <text x={x0 - 60} y={by} fontSize="11">raised</text>
          <text x={x0 + 4 * 2 * r + 60} y={by} fontSize="11">swings out</text>
          <text x={W / 2} y={H - 30} fontSize="12" fontWeight="700">Conservation of momentum & energy</text>
        </g>
      )}
    </g>
  );
}

// ---- Density & floating ----------------------------------------------------
export function Density({ showLabels = true }) {
  const x0 = 150, x1 = W - 150, top = 130, waterY = 190, bot = H - 90;
  return (
    <g>
      <path d={`M ${x0} ${top} L ${x0} ${bot} L ${x1} ${bot} L ${x1} ${top}`} fill="none" stroke="#334155" strokeWidth="2.5" />
      <rect x={x0} y={waterY} width={x1 - x0} height={bot - waterY} fill="#bae6fd" opacity="0.6" />
      <line x1={x0} y1={waterY} x2={x1} y2={waterY} stroke="#0284c7" strokeWidth="2" />
      {/* floating object (half submerged) */}
      <rect x={W / 2 - 130} y={waterY - 26} width="70" height="52" rx="4" fill="#a16207" stroke="#78350f" strokeWidth="1.5" />
      <line x1={W / 2 - 95} y1={waterY + 60} x2={W / 2 - 95} y2={waterY + 20} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* sinking object (dense, at bottom) */}
      <rect x={W / 2 + 70} y={bot - 44} width="56" height="40" rx="4" fill="#334155" />
      {showLabels && (
        <g fill="#334155">
          <text x={W / 2 - 95} y={waterY - 36} fontSize="11" textAnchor="middle" fontWeight="700">floats (less dense)</text>
          <text x={W / 2 - 60} y={waterY + 50} fontSize="10" fill="#16a34a">upthrust</text>
          <text x={W / 2 + 98} y={bot + 18} fontSize="11" textAnchor="middle" fontWeight="700">sinks (denser)</text>
          <text x={W / 2} y={80} fontSize="13" fontWeight="700" textAnchor="middle">Density & floating (upthrust vs weight)</text>
        </g>
      )}
    </g>
  );
}

// ---- Sankey energy diagram -------------------------------------------------
export function SankeyEnergy({ showLabels = true }) {
  const x0 = 120, inY = H / 2, inH = 160;
  return (
    <g>
      {/* input */}
      <rect x={x0} y={inY - inH / 2} width="60" height={inH} fill="#f59e0b" opacity="0.8" />
      {/* useful (top) */}
      <path d={`M ${x0 + 60} ${inY - inH / 2} L ${W - 120} ${inY - 120} L ${W - 120} ${inY - 80} L ${x0 + 60} ${inY - inH / 2 + 48} Z`} fill="#16a34a" opacity="0.8" />
      {/* wasted (bottom) */}
      <path d={`M ${x0 + 60} ${inY - inH / 2 + 48} L ${W - 120} ${inY + 40} L ${W - 120} ${inY + 140} L ${x0 + 60} ${inY + inH / 2} Z`} fill="#dc2626" opacity="0.6" />
      {showLabels && (
        <g fill="#334155">
          <text x={x0 + 30} y={inY - inH / 2 - 10} fontSize="12" fontWeight="700" textAnchor="middle">100 J in</text>
          <text x={W - 116} y={inY - 100} fontSize="12" fontWeight="700" fill="#16a34a">useful (light) 30 J</text>
          <text x={W - 116} y={inY + 96} fontSize="12" fontWeight="700" fill="#dc2626">wasted (heat) 70 J</text>
          <text x={W / 2} y={60} fontSize="13" fontWeight="700" textAnchor="middle">Sankey diagram — energy transfer</text>
        </g>
      )}
    </g>
  );
}

// ---- Half-life -------------------------------------------------------------
export function HalfLife({ showLabels = true }) {
  const x0 = 90, y0 = H - 80, x1 = W - 70, y1 = 70, plotW = x1 - x0, plotH = y0 - y1;
  const pts = [];
  for (let t = 0; t <= 4; t += 0.1) pts.push(`${(x0 + (t / 4) * plotW).toFixed(1)},${(y0 - (Math.pow(0.5, t)) * plotH).toFixed(1)}`);
  return (
    <g>
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="currentColor" strokeWidth="1.8" markerEnd="url(#il-arrow)" />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="currentColor" strokeWidth="1.8" markerEnd="url(#il-arrow)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#7c3aed" strokeWidth="3" />
      {[1, 2, 3].map((t, i) => { const x = x0 + (t / 4) * plotW, y = y0 - Math.pow(0.5, t) * plotH; return <g key={i}><line x1={x} y1={y0} x2={x} y2={y} stroke="#dc2626" strokeWidth="1" strokeDasharray="4 3" /><line x1={x0} y1={y} x2={x} y2={y} stroke="#dc2626" strokeWidth="1" strokeDasharray="4 3" /></g>; })}
      {showLabels && (
        <g fill="#334155">
          <text x={(x0 + x1) / 2} y={y0 + 30} fontSize="12" textAnchor="middle">time (half-lives)</text>
          <text x={30} y={(y0 + y1) / 2} fontSize="12" textAnchor="middle" transform={`rotate(-90 30 ${(y0 + y1) / 2})`}>amount remaining</text>
          <text x={x0 + plotW / 4} y={y0 - Math.pow(0.5, 1) * plotH - 8} fontSize="10" fill="#dc2626">50%</text>
          <text x={x0 + plotW / 2} y={y0 - Math.pow(0.5, 2) * plotH - 8} fontSize="10" fill="#dc2626">25%</text>
          <text x={W / 2} y={50} fontSize="13" fontWeight="700" textAnchor="middle">Radioactive half-life</text>
        </g>
      )}
    </g>
  );
}

// ---- Electromagnet ---------------------------------------------------------
export function Electromagnet({ showLabels = true }) {
  const cx = W / 2, cy = H / 2, x0 = cx - 120, x1 = cx + 120;
  return (
    <g>
      {/* iron core */}
      <rect x={x0} y={cy - 20} width={x1 - x0} height="40" rx="6" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
      {/* coil loops */}
      {Array.from({ length: 8 }).map((_, i) => <ellipse key={i} cx={x0 + 20 + i * 28} cy={cy} rx="10" ry="34" fill="none" stroke="#b45309" strokeWidth="3" />)}
      {/* battery leads */}
      <line x1={x0 + 20} y1={cy + 34} x2={x0 + 20} y2={cy + 90} stroke="#334155" strokeWidth="2.5" />
      <line x1={x1 - 20} y1={cy + 34} x2={x1 - 20} y2={cy + 90} stroke="#334155" strokeWidth="2.5" />
      <line x1={x0 + 20} y1={cy + 90} x2={cx - 8} y2={cy + 90} stroke="#334155" strokeWidth="2.5" />
      <line x1={cx + 8} y1={cy + 90} x2={x1 - 20} y2={cy + 90} stroke="#334155" strokeWidth="2.5" />
      <line x1={cx - 8} y1={cy + 80} x2={cx - 8} y2={cy + 100} stroke="#334155" strokeWidth="4" /><line x1={cx + 8} y1={cy + 85} x2={cx + 8} y2={cy + 95} stroke="#334155" strokeWidth="4" />
      {/* poles */}
      <text x={x0 - 6} y={cy + 5} fontSize="18" fontWeight="800" fill="#dc2626" textAnchor="end">N</text>
      <text x={x1 + 6} y={cy + 5} fontSize="18" fontWeight="800" fill="#2563eb">S</text>
      {showLabels && (
        <g fill="#334155">
          <Leader x={cx} y={cy - 34} tx={cx} ty={80} text="Coil (solenoid)" color="#b45309" side="right" />
          <Leader x={cx} y={cy} tx={70} ty={cy} text="Soft iron core" color="#475569" side="left" />
          <text x={cx} y={cy + 130} fontSize="11" textAnchor="middle">current through the coil magnetises the core</text>
        </g>
      )}
    </g>
  );
}

// ---- Types of rainfall -----------------------------------------------------
export function RainfallTypes({ showLabels = true }) {
  const y = H - 120, xs = [W / 6, W / 2, 5 * W / 6];
  const rain = (cx, cy) => [...Array(5)].map((_, i) => <line key={i} x1={cx - 24 + i * 12} y1={cy} x2={cx - 28 + i * 12} y2={cy + 24} stroke="#2563eb" strokeWidth="2" />);
  return (
    <g>
      {/* Relief */}
      <path d={`M ${xs[0] - 80} ${y} L ${xs[0]} ${y - 120} L ${xs[0] + 80} ${y} Z`} fill="#cbd5e1" stroke="#64748b" strokeWidth="2" />
      <circle cx={xs[0] - 20} cy={y - 110} r="20" fill="#94a3b8" />{rain(xs[0] - 20, y - 90)}
      <line x1={xs[0] - 110} y1={y - 40} x2={xs[0] - 60} y2={y - 80} stroke="#0ea5e9" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {/* Convectional */}
      <circle cx={xs[1]} cy={y - 120} r="26" fill="#94a3b8" />{rain(xs[1], y - 96)}
      {[-1, 0, 1].map((o, i) => <line key={i} x1={xs[1] + o * 20} y1={y} x2={xs[1] + o * 20} y2={y - 90} stroke="#dc2626" strokeWidth="2" markerEnd="url(#il-arrow)" />)}
      <path d={`M ${xs[1] - 40} ${y} h 80`} stroke="#f59e0b" strokeWidth="3" />
      {/* Frontal */}
      <path d={`M ${xs[2] - 80} ${y} q 80 -30 160 0`} fill="#bfdbfe" opacity="0.5" />
      <circle cx={xs[2]} cy={y - 90} r="22" fill="#94a3b8" />{rain(xs[2], y - 68)}
      <text x={xs[2] - 60} y={y - 10} fontSize="10" fill="#2563eb">cold</text><text x={xs[2] + 50} y={y - 10} fontSize="10" fill="#dc2626">warm</text>
      {showLabels && (
        <g textAnchor="middle" fill="#334155" fontSize="12" fontWeight="700">
          <text x={xs[0]} y={y + 44}>Relief</text><text x={xs[1]} y={y + 44}>Convectional</text><text x={xs[2]} y={y + 44}>Frontal</text>
        </g>
      )}
    </g>
  );
}

// ---- Weathering ------------------------------------------------------------
export function Weathering({ showLabels = true }) {
  const y = H / 2, xs = [W / 6, W / 2, 5 * W / 6];
  return (
    <g>
      {/* physical: freeze-thaw crack */}
      <path d={`M ${xs[0] - 60} ${y + 50} L ${xs[0] - 40} ${y - 40} L ${xs[0] + 60} ${y - 30} L ${xs[0] + 50} ${y + 50} Z`} fill="#a8a29e" stroke="#57534e" strokeWidth="2" />
      <path d={`M ${xs[0]} ${y - 36} L ${xs[0] + 6} ${y + 20}`} stroke="#0ea5e9" strokeWidth="4" />
      {/* chemical: acid rain dissolving */}
      <path d={`M ${xs[1] - 60} ${y + 50} L ${xs[1] - 40} ${y - 30} Q ${xs[1]} ${y - 50} ${xs[1] + 50} ${y - 20} L ${xs[1] + 55} ${y + 50} Z`} fill="#d6d3d1" stroke="#57534e" strokeWidth="2" />
      {[...Array(4)].map((_, i) => <line key={i} x1={xs[1] - 30 + i * 20} y1={y - 60} x2={xs[1] - 34 + i * 20} y2={y - 36} stroke="#84cc16" strokeWidth="2" markerEnd="url(#il-arrow)" />)}
      {/* biological: roots split rock */}
      <path d={`M ${xs[2] - 60} ${y + 50} L ${xs[2] - 50} ${y - 30} L ${xs[2] + 50} ${y - 30} L ${xs[2] + 55} ${y + 50} Z`} fill="#a8a29e" stroke="#57534e" strokeWidth="2" />
      <path d={`M ${xs[2]} ${y - 60} v 40 M ${xs[2]} ${y - 30} q -14 30 -20 60 M ${xs[2]} ${y - 30} q 14 30 20 60`} fill="none" stroke="#16a34a" strokeWidth="3" />
      {showLabels && (
        <g textAnchor="middle" fill="#334155" fontSize="12" fontWeight="700">
          <text x={xs[0]} y={y + 80}>Physical</text><text x={xs[0]} y={y + 96} fontSize="9.5" fontWeight="400" fill="#64748b">freeze–thaw</text>
          <text x={xs[1]} y={y + 80}>Chemical</text><text x={xs[1]} y={y + 96} fontSize="9.5" fontWeight="400" fill="#64748b">acid rain</text>
          <text x={xs[2]} y={y + 80}>Biological</text><text x={xs[2]} y={y + 96} fontSize="9.5" fontWeight="400" fill="#64748b">plant roots</text>
        </g>
      )}
    </g>
  );
}

// ---- Comet structure -------------------------------------------------------
export function CometStructure({ showLabels = true }) {
  const cx = W / 2 + 60, cy = H / 2;
  return (
    <g>
      {/* Sun (far left) */}
      <g filter="url(#viz-shadow)"><Sphere cx={70} cy={cy} r={30} fill="#fbbf24" /></g>
      {/* coma + nucleus */}
      <circle cx={cx} cy={cy} r="46" fill="#bae6fd" opacity="0.6" />
      <g filter="url(#viz-shadow)"><Sphere cx={cx} cy={cy} r={18} fill="#64748b" /></g>
      {/* ion tail (straight, away from sun) + dust tail (curved) */}
      <path d={`M ${cx + 20} ${cy - 6} L ${W - 40} ${cy - 70}`} stroke="#38bdf8" strokeWidth="8" strokeLinecap="round" opacity="0.7" />
      <path d={`M ${cx + 20} ${cy + 10} Q ${cx + 180} ${cy + 40} ${W - 40} ${cy + 30}`} fill="none" stroke="#fcd34d" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
      {showLabels && (
        <g fill="#334155">
          <text x={70} y={cy + 50} fontSize="11" textAnchor="middle" fill="#f59e0b">Sun</text>
          <Leader x={cx} y={cy} tx={cx} ty={H - 24} text="Nucleus (ice + dust)" color="#334155" side="right" />
          <Leader x={cx} y={cy - 40} tx={70} ty={90} text="Coma" color="#0284c7" side="left" />
          <text x={W - 120} y={cy - 70} fontSize="11" fill="#0284c7">ion tail</text>
          <text x={W - 120} y={cy + 50} fontSize="11" fill="#a16207">dust tail</text>
          <text x={W / 2} y={40} fontSize="11" fill="#64748b" textAnchor="middle">tails always point away from the Sun</text>
        </g>
      )}
    </g>
  );
}


// ---- Menstrual cycle (hormones + uterine lining) ---------------------------
export function MenstrualCycle({ showLabels = true }) {
  const x0 = 90, x1 = W - 60, y0 = H - 90, plotW = x1 - x0;
  const wave = (amp, base, phase, k, color) => {
    const pts = [];
    for (let d = 0; d <= 28; d += 0.5) pts.push(`${(x0 + (d / 28) * plotW).toFixed(1)},${(base - amp * Math.max(0, Math.sin((d - phase) / 28 * Math.PI * 2 + Math.PI / 2))).toFixed(1)}`);
    return <polyline key={k} points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2.5" />;
  };
  return (
    <g>
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#il-arrow)" />
      {/* uterine lining thickness (grows to ~day 22 then sheds) */}
      <path d={`M ${x0} ${y0} L ${x0 + plotW * 0.18} ${y0} L ${x0 + plotW * 0.8} ${y0 - 70} L ${x0 + plotW} ${y0 - 40} L ${x0 + plotW} ${y0} Z`} fill="#fecaca" opacity="0.5" />
      {wave(90, y0 - 20, 12, "estrogen", "#16a34a")}
      {wave(70, y0 - 20, 20, "progesterone", "#7c3aed")}
      {/* ovulation marker ~day 14 */}
      <line x1={x0 + plotW * 0.5} y1={y0} x2={x0 + plotW * 0.5} y2={110} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
      {showLabels && (
        <g fill="#334155">
          <text x={(x0 + x1) / 2} y={y0 + 30} fontSize="12" textAnchor="middle">day of cycle (0 → 28)</text>
          <text x={x0 + plotW * 0.5} y={100} fontSize="11" fill="#f59e0b" textAnchor="middle">ovulation (~day 14)</text>
          <text x={x0 + 20} y={y0 - 10} fontSize="10" fill="#dc2626">menstruation</text>
          <text x={x1 - 10} y={130} fontSize="11" fill="#16a34a" textAnchor="end">estrogen</text>
          <text x={x1 - 10} y={148} fontSize="11" fill="#7c3aed" textAnchor="end">progesterone</text>
          <text x={W / 2} y={40} fontSize="13" fontWeight="700" textAnchor="middle">Menstrual cycle</text>
        </g>
      )}
    </g>
  );
}

// ---- Pedigree chart --------------------------------------------------------
export function PedigreeChart({ showLabels = true }) {
  const male = (x, y, aff) => <rect x={x - 16} y={y - 16} width="32" height="32" fill={aff ? "#334155" : "#fff"} stroke="#334155" strokeWidth="2" />;
  const female = (x, y, aff) => <circle cx={x} cy={y} r="18" fill={aff ? "#334155" : "#fff"} stroke="#334155" strokeWidth="2" />;
  const cx = W / 2;
  return (
    <g>
      {/* Gen I */}
      {male(cx - 80, 120, false)}{female(cx + 80, 120, true)}
      <line x1={cx - 64} y1={120} x2={cx + 62} y2={120} stroke="#334155" strokeWidth="2" />
      <line x1={cx} y1={120} x2={cx} y2={180} stroke="#334155" strokeWidth="2" />
      {/* Gen II */}
      <line x1={cx - 140} y1={180} x2={cx + 140} y2={180} stroke="#334155" strokeWidth="2" />
      {[[-140, false], [0, true], [140, false]].map(([dx, aff], i) => <g key={i}><line x1={cx + dx} y1={180} x2={cx + dx} y2={220} stroke="#334155" strokeWidth="2" />{i === 1 ? male(cx + dx, 240, aff) : (i === 0 ? female(cx + dx, 240, aff) : male(cx + dx, 240, aff))}</g>)}
      {/* couple II + spouse -> Gen III */}
      <line x1={cx} y1={240} x2={cx + 200} y2={240} stroke="#334155" strokeWidth="2" />{female(cx + 200, 240, false)}
      <line x1={cx + 100} y1={240} x2={cx + 100} y2={300} stroke="#334155" strokeWidth="2" />
      <line x1={cx + 60} y1={300} x2={cx + 140} y2={300} stroke="#334155" strokeWidth="2" />
      {female(cx + 60, 340, true)}{male(cx + 140, 340, false)}
      <line x1={cx + 60} y1={300} x2={cx + 60} y2={322} stroke="#334155" strokeWidth="2" /><line x1={cx + 140} y1={300} x2={cx + 140} y2={322} stroke="#334155" strokeWidth="2" />
      {showLabels && (
        <g fill="#334155" fontSize="11">
          <text x={70} y={126} textAnchor="end">I</text><text x={70} y={246} textAnchor="end">II</text><text x={70} y={346} textAnchor="end">III</text>
          <rect x={80} y={H - 60} width="18" height="18" fill="#334155" /><text x={104} y={H - 46}>affected</text>
          <rect x={200} y={H - 60} width="18" height="18" fill="#fff" stroke="#334155" strokeWidth="2" /><text x={224} y={H - 46}>unaffected</text>
          <text x={W - 80} y={H - 46} textAnchor="end">□ male · ○ female</text>
        </g>
      )}
    </g>
  );
}

// ---- Pyramid of numbers ----------------------------------------------------
export function PyramidOfNumbers({ showLabels = true }) {
  const cx = W / 2, base = H - 90, levelH = 70;
  const levels = [["Producers (many)", 460, "#16a34a"], ["Primary consumers", 300, "#84cc16"], ["Secondary consumers", 170, "#f59e0b"], ["Top consumer (few)", 70, "#dc2626"]];
  return (
    <g>
      {levels.map(([name, w, color], i) => {
        const y = base - i * levelH;
        return (
          <g key={i} filter="url(#viz-shadow)">
            <rect x={cx - w / 2} y={y - levelH + 6} width={w} height={levelH - 10} fill={color} stroke="#334155" strokeWidth="1.5" />
            {showLabels && <text x={cx} y={y - levelH / 2 + 4} fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">{name}</text>}
          </g>
        );
      })}
      {showLabels && <text x={W / 2} y={60} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">Pyramid of numbers</text>}
    </g>
  );
}

// ---- Nervous system (CNS / PNS) --------------------------------------------
export function NervousSystem({ showLabels = true }) {
  const cx = W / 2;
  return (
    <g>
      {/* brain */}
      <path d={`M ${cx - 34} 100 Q ${cx} 60 ${cx + 34} 100 Q ${cx + 46} 130 ${cx} 140 Q ${cx - 46} 130 ${cx - 34} 100 Z`} fill="#fecdd3" stroke="#be185d" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* spinal cord */}
      <rect x={cx - 10} y={140} width="20" height="260" rx="8" fill="#fbcfe8" stroke="#be185d" strokeWidth="2" />
      {/* peripheral nerves */}
      {[170, 220, 270, 320, 370].map((y, i) => <g key={i}><line x1={cx - 10} y1={y} x2={cx - 120} y2={y + 20} stroke="#f59e0b" strokeWidth="2.5" /><line x1={cx + 10} y1={y} x2={cx + 120} y2={y + 20} stroke="#f59e0b" strokeWidth="2.5" /></g>)}
      {showLabels && (
        <g>
          <Leader x={cx} y={100} tx={70} ty={90} text="Brain" color="#be185d" side="left" />
          <Leader x={cx} y={260} tx={70} ty={280} text="Spinal cord" color="#be185d" side="left" />
          <Leader x={cx + 100} y={290} tx={W - 60} ty={300} text="Peripheral nerves (PNS)" color="#f59e0b" side="right" />
          <text x={cx} y={H - 30} fontSize="11" fill="#64748b" textAnchor="middle">CNS = brain + spinal cord · PNS = nerves</text>
        </g>
      )}
    </g>
  );
}

// ---- Leaf external structure -----------------------------------------------
export function LeafStructure({ showLabels = true }) {
  const cx = W / 2, cy = H / 2 - 10;
  return (
    <g>
      <path d={`M ${cx} ${cy - 150} Q ${cx + 150} ${cy - 40} ${cx} ${cy + 150} Q ${cx - 150} ${cy - 40} ${cx} ${cy - 150} Z`} fill="#bbf7d0" stroke="#16a34a" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* midrib + veins */}
      <line x1={cx} y1={cy - 150} x2={cx} y2={cy + 150} stroke="#15803d" strokeWidth="3" />
      {[-100, -50, 0, 50, 100].map((o, i) => <g key={i}><path d={`M ${cx} ${cy + o} q -60 -20 -100 -40`} fill="none" stroke="#16a34a" strokeWidth="1.5" /><path d={`M ${cx} ${cy + o} q 60 -20 100 -40`} fill="none" stroke="#16a34a" strokeWidth="1.5" /></g>)}
      {/* petiole */}
      <line x1={cx} y1={cy + 150} x2={cx} y2={cy + 200} stroke="#15803d" strokeWidth="6" strokeLinecap="round" />
      {showLabels && (
        <g>
          <Leader x={cx + 90} y={cy - 60} tx={W - 60} ty={cy - 120} text="Blade (lamina)" color="#16a34a" side="right" />
          <Leader x={cx} y={cy} tx={70} ty={cy - 40} text="Midrib" color="#15803d" side="left" />
          <Leader x={cx - 70} y={cy + 20} tx={70} ty={cy + 80} text="Veins" color="#16a34a" side="left" />
          <Leader x={cx} y={cy + 180} tx={W - 60} ty={cy + 180} text="Petiole (stalk)" color="#15803d" side="right" />
        </g>
      )}
    </g>
  );
}

// ---- Guard cells / stomata (open & closed) ---------------------------------
export function GuardCells({ showLabels = true }) {
  const y = H / 2;
  const stoma = (cx, open) => (
    <g>
      <path d={`M ${cx - 40} ${y} q -20 ${-open ? 0 : 0} 0 0`} />
      <path d={`M ${cx} ${y - 50} q ${open ? 34 : 12} 24 0 100 q ${open ? -34 : -12} -24 0 -100`} fill="#86efac" stroke="#15803d" strokeWidth="2.5" transform={`translate(${-open ? 0 : 0} 0)`} />
      <path d={`M ${cx} ${y - 50} q ${open ? -34 : -12} 24 0 100 q ${open ? 34 : 12} -24 0 -100`} fill="#86efac" stroke="#15803d" strokeWidth="2.5" />
      {showLabels && <text x={cx} y={y + 84} fontSize="13" fontWeight="700" fill="#334155" textAnchor="middle">{open ? "Open (turgid)" : "Closed (flaccid)"}</text>}
    </g>
  );
  return (
    <g>
      {stoma(W / 3, true)}
      {stoma((2 * W) / 3, false)}
      {showLabels && (
        <g fill="#334155" textAnchor="middle">
          <text x={W / 3} y={y + 104} fontSize="10" fill="#64748b">gas exchange & transpiration</text>
          <text x={(2 * W) / 3} y={y + 104} fontSize="10" fill="#64748b">reduces water loss</text>
          <text x={W / 2} y={70} fontSize="13" fontWeight="700">Guard cells control the stoma</text>
        </g>
      )}
    </g>
  );
}

// ---- Blast furnace (iron extraction) ---------------------------------------
export function BlastFurnace({ showLabels = true }) {
  const cx = W / 2, top = 90, bot = H - 80;
  return (
    <g>
      <path d={`M ${cx - 90} ${top} L ${cx - 90} ${top + 70} L ${cx - 120} ${bot - 90} L ${cx - 70} ${bot} L ${cx + 70} ${bot} L ${cx + 120} ${bot - 90} L ${cx + 90} ${top + 70} L ${cx + 90} ${top} Z`} fill="#e2e8f0" stroke="#334155" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* zones */}
      <rect x={cx - 100} y={bot - 60} width="200" height="50" fill="#f97316" opacity="0.5" />
      {/* charge in top */}
      <line x1={cx} y1={40} x2={cx} y2={top} stroke="#334155" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* hot air blast */}
      {[-1, 1].map((d, i) => <line key={i} x1={cx + d * 160} y1={bot - 40} x2={cx + d * 90} y2={bot - 40} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />)}
      {/* molten iron + slag taps */}
      <line x1={cx - 60} y1={bot} x2={cx - 130} y2={bot + 30} stroke="#f59e0b" strokeWidth="4" />
      <line x1={cx + 60} y1={bot - 20} x2={cx + 130} y2={bot + 10} stroke="#a16207" strokeWidth="4" />
      {showLabels && (
        <g fill="#334155">
          <text x={cx} y={34} fontSize="11" textAnchor="middle">iron ore + coke + limestone</text>
          <text x={cx + 150} y={bot - 46} fontSize="10.5" textAnchor="end" fill="#dc2626">hot air</text>
          <text x={cx - 132} y={bot + 44} fontSize="10.5" textAnchor="end" fill="#f59e0b">molten iron</text>
          <text x={cx + 132} y={bot + 24} fontSize="10.5" fill="#a16207">slag</text>
          <text x={W / 2} y={H - 20} fontSize="12" fontWeight="700" textAnchor="middle">Blast furnace — iron extraction</text>
        </g>
      )}
    </g>
  );
}

// ---- Haber process ---------------------------------------------------------
export function HaberProcess({ showLabels = true }) {
  const y = H / 2;
  return (
    <g>
      {/* reactants in */}
      <line x1={70} y1={y - 40} x2={W / 2 - 80} y2={y - 40} stroke="#2563eb" strokeWidth="3" markerEnd="url(#il-arrow)" />
      <line x1={70} y1={y + 40} x2={W / 2 - 80} y2={y + 40} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* reactor */}
      <rect x={W / 2 - 80} y={y - 70} width="160" height="140" rx="12" fill="#fef9c3" stroke="#ca8a04" strokeWidth="2.5" filter="url(#viz-shadow)" />
      {/* product out */}
      <line x1={W / 2 + 80} y1={y} x2={W - 90} y2={y} stroke="#7c3aed" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g fill="#334155">
          <text x={90} y={y - 50} fontSize="12" fontWeight="700" fill="#2563eb">N₂ (air)</text>
          <text x={90} y={y + 58} fontSize="12" fontWeight="700" fill="#16a34a">H₂ (natural gas)</text>
          <text x={W / 2} y={y - 20} fontSize="11" textAnchor="middle">Fe catalyst</text>
          <text x={W / 2} y={y + 4} fontSize="11" textAnchor="middle">~450 °C, 200 atm</text>
          <text x={W / 2} y={y + 26} fontSize="11" textAnchor="middle" fill="#64748b">N₂ + 3H₂ ⇌ 2NH₃</text>
          <text x={W - 90} y={y - 14} fontSize="12" fontWeight="700" fill="#7c3aed" textAnchor="end">NH₃ (ammonia)</text>
          <text x={W / 2} y={60} fontSize="13" fontWeight="700" textAnchor="middle">Haber process</text>
        </g>
      )}
    </g>
  );
}

// ---- Metallic bonding ------------------------------------------------------
export function MetallicBonding({ showLabels = true }) {
  const x0 = W / 2 - 150, y0 = H / 2 - 100;
  const ions = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) ions.push([x0 + 40 + c * 90, y0 + 40 + r * 60]);
  return (
    <g>
      {ions.map(([x, y], i) => <g key={i}><g filter="url(#viz-shadow)"><Sphere cx={x} cy={y} r={22} fill="#2563eb" /></g><text x={x} y={y + 4} fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">+</text></g>)}
      {/* delocalised electrons scattered */}
      {[...Array(24)].map((_, i) => { const a = i * 2.399; const x = W / 2 + (140 * Math.cos(a)) * ((i % 6 + 1) / 6); const y = H / 2 + (110 * Math.sin(a)) * ((i % 6 + 1) / 6); return <circle key={i} cx={x} cy={y} r="4" fill="#f59e0b" />; })}
      {showLabels && (
        <g fill="#334155" textAnchor="middle">
          <text x={W / 2} y={60} fontSize="13" fontWeight="700">Metallic bonding</text>
          <text x={W / 2} y={H - 40} fontSize="11" fill="#64748b">lattice of positive ions in a "sea" of delocalised electrons (yellow)</text>
        </g>
      )}
    </g>
  );
}


// ---- Giant ionic lattice (NaCl) --------------------------------------------
export function IonicLattice({ showLabels = true }) {
  const x0 = W / 2 - 150, y0 = H / 2 - 120, gap = 74;
  const ions = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) ions.push([x0 + c * gap, y0 + r * gap, (r + c) % 2 === 0]);
  return (
    <g>
      {ions.map(([x, y], i) => { return <g key={`b${i}`}>{i % 4 !== 3 && <line x1={x} y1={y} x2={x + gap} y2={y} stroke="#cbd5e1" strokeWidth="1.5" />}{Math.floor(i / 4) !== 3 && <line x1={x} y1={y} x2={x} y2={y + gap} stroke="#cbd5e1" strokeWidth="1.5" />}</g>; })}
      {ions.map(([x, y, na], i) => (
        <g key={i}>
          <g filter="url(#viz-shadow)"><Sphere cx={x} cy={y} r={na ? 16 : 24} fill={na ? "#8b5cf6" : "#10b981"} /></g>
          <text x={x} y={y + 4} fontSize={na ? 9 : 11} fontWeight="700" fill="#fff" textAnchor="middle">{na ? "Na⁺" : "Cl⁻"}</text>
        </g>
      ))}
      {showLabels && (
        <g fill="#334155" textAnchor="middle">
          <text x={W / 2} y={50} fontSize="13" fontWeight="700">Giant ionic lattice (NaCl)</text>
          <text x={W / 2} y={H - 34} fontSize="11" fill="#64748b">regular repeating array of oppositely-charged ions</text>
        </g>
      )}
    </g>
  );
}

// ---- Newton's three laws ---------------------------------------------------
export function NewtonsLaws({ showLabels = true }) {
  const y = H / 2, xs = [W / 6, W / 2, 5 * W / 6];
  return (
    <g>
      {/* 1st: inertia (object at rest) */}
      <rect x={xs[0] - 30} y={y - 26} width="60" height="52" rx="6" fill="#2563eb" />
      <line x1={xs[0] - 70} y1={y + 40} x2={xs[0] + 70} y2={y + 40} stroke="#334155" strokeWidth="3" />
      {/* 2nd: F = ma */}
      <rect x={xs[1] - 26} y={y - 22} width="52" height="44" rx="6" fill="#16a34a" />
      <line x1={xs[1] + 26} y1={y} x2={xs[1] + 90} y2={y} stroke="#dc2626" strokeWidth="4" markerEnd="url(#il-arrow)" />
      {/* 3rd: action-reaction */}
      <rect x={xs[2] - 26} y={y - 22} width="52" height="44" rx="6" fill="#f59e0b" />
      <line x1={xs[2] - 26} y1={y} x2={xs[2] - 90} y2={y} stroke="#dc2626" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      <line x1={xs[2] + 26} y1={y} x2={xs[2] + 90} y2={y} stroke="#7c3aed" strokeWidth="3.5" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g textAnchor="middle" fill="#334155">
          <text x={xs[0]} y={y + 76} fontSize="12" fontWeight="700">1st law</text><text x={xs[0]} y={y + 92} fontSize="9.5" fill="#64748b">inertia (stays at rest)</text>
          <text x={xs[1]} y={y + 76} fontSize="12" fontWeight="700">2nd law</text><text x={xs[1]} y={y + 92} fontSize="9.5" fill="#64748b">F = m × a</text>
          <text x={xs[2]} y={y + 76} fontSize="12" fontWeight="700">3rd law</text><text x={xs[2]} y={y + 92} fontSize="9.5" fill="#64748b">action = reaction</text>
        </g>
      )}
    </g>
  );
}

// ---- Moments (balancing) ---------------------------------------------------
export function Moments({ showLabels = true }) {
  const cx = W / 2, y = H / 2;
  return (
    <g>
      <line x1={cx - 220} y1={y} x2={cx + 220} y2={y} stroke="#a16207" strokeWidth="8" strokeLinecap="round" />
      <path d={`M ${cx - 20} ${y + 40} L ${cx} ${y + 8} L ${cx + 20} ${y + 40} Z`} fill="#334155" />
      <rect x={cx - 200} y={y - 60} width="50" height="50" fill="#2563eb" />
      <rect x={cx + 130} y={y - 44} width="34" height="34" fill="#dc2626" />
      <line x1={cx - 175} y1={y} x2={cx - 175} y2={y - 62} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
      <line x1={cx + 147} y1={y} x2={cx + 147} y2={y - 46} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
      {showLabels && (
        <g fill="#334155" textAnchor="middle">
          <text x={cx} y={y + 70} fontSize="11">pivot</text>
          <text x={cx - 100} y={y + 24} fontSize="10.5">d₁</text><text x={cx + 74} y={y + 24} fontSize="10.5">d₂</text>
          <text x={W / 2} y={70} fontSize="13" fontWeight="700">Moments: F₁ × d₁ = F₂ × d₂ (balanced)</text>
        </g>
      )}
    </g>
  );
}

// ---- Pressure in liquids ---------------------------------------------------
export function LiquidPressure({ showLabels = true }) {
  const x0 = 180, top = 110, bot = H - 80;
  return (
    <g>
      <path d={`M ${x0} ${top} L ${x0} ${bot} L ${x0 + 120} ${bot} L ${x0 + 120} ${top}`} fill="#bae6fd" fillOpacity="0.5" stroke="#334155" strokeWidth="2.5" />
      {[0.3, 0.55, 0.8].map((f, i) => { const y = top + f * (bot - top); const len = 40 + f * 140; return <g key={i}><path d={`M ${x0 + 120} ${y} q ${len * 0.5} 10 ${len} ${len * 0.4}`} fill="none" stroke="#0ea5e9" strokeWidth="3" markerEnd="url(#il-arrow)" /></g>; })}
      {showLabels && (
        <g fill="#334155">
          <text x={x0 + 60} y={top - 16} fontSize="12" fontWeight="700" textAnchor="middle">water tank</text>
          <text x={x0 + 260} y={bot} fontSize="11" fill="#0ea5e9">deeper → higher pressure → jet travels further</text>
          <text x={W / 2} y={60} fontSize="13" fontWeight="700" textAnchor="middle">Pressure increases with depth</text>
        </g>
      )}
    </g>
  );
}

// ---- Hooke's law -----------------------------------------------------------
export function HookesLaw({ showLabels = true }) {
  const sx = 170, top = 90;
  const coils = 8, gap = 16;
  const x0 = W / 2 + 30, y0 = H - 90, x1 = W - 70, y1 = 90;
  return (
    <g>
      {/* spring + weight (left) */}
      <line x1={sx - 60} y1={top} x2={sx + 60} y2={top} stroke="#334155" strokeWidth="5" />
      {Array.from({ length: coils }).map((_, i) => <line key={i} x1={sx - 16} y1={top + 10 + i * gap} x2={sx + 16} y2={top + 18 + i * gap} stroke="#64748b" strokeWidth="2.5" />)}
      <rect x={sx - 22} y={top + 10 + coils * gap} width="44" height="40" fill="#2563eb" />
      {/* graph (right) */}
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#il-arrow)" />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#il-arrow)" />
      <line x1={x0} y1={y0} x2={x1 - 30} y2={y1 + 20} stroke="#dc2626" strokeWidth="3" />
      {showLabels && (
        <g fill="#334155">
          <text x={sx} y={top + 10 + coils * gap + 74} fontSize="11" textAnchor="middle">load stretches spring</text>
          <text x={(x0 + x1) / 2} y={y0 + 26} fontSize="11" textAnchor="middle">extension</text>
          <text x={x0 - 14} y={(y0 + y1) / 2} fontSize="11" textAnchor="middle" transform={`rotate(-90 ${x0 - 14} ${(y0 + y1) / 2})`}>force</text>
          <text x={x1 - 60} y={y1 + 40} fontSize="10.5" fill="#dc2626">F ∝ e (linear)</text>
          <text x={W / 2} y={50} fontSize="13" fontWeight="700" textAnchor="middle">Hooke's law</text>
        </g>
      )}
    </g>
  );
}

// ---- Motor effect / Fleming's left-hand rule -------------------------------
export function MotorEffect({ showLabels = true }) {
  const cx = W / 2, cy = H / 2;
  return (
    <g>
      {/* magnet poles */}
      <rect x={cx - 160} y={cy - 80} width="46" height="160" fill="#dc2626" /><text x={cx - 137} y={cy + 6} fontSize="20" fontWeight="800" fill="#fff" textAnchor="middle">N</text>
      <rect x={cx + 114} y={cy - 80} width="46" height="160" fill="#2563eb" /><text x={cx + 137} y={cy + 6} fontSize="20" fontWeight="800" fill="#fff" textAnchor="middle">S</text>
      <line x1={cx - 114} y1={cy} x2={cx + 114} y2={cy} stroke="#94a3b8" strokeWidth="2" markerEnd="url(#il-arrow)" />
      {/* wire (current, into/out) */}
      <circle cx={cx} cy={cy} r="14" fill="#fff" stroke="#b45309" strokeWidth="3" /><circle cx={cx} cy={cy} r="3" fill="#b45309" />
      {/* force (up) */}
      <line x1={cx} y1={cy - 20} x2={cx} y2={cy - 110} stroke="#16a34a" strokeWidth="4" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g fill="#334155">
          <text x={cx + 10} y={cy - 90} fontSize="13" fontWeight="700" fill="#16a34a">F (force)</text>
          <text x={cx - 60} y={cy - 8} fontSize="12" fill="#94a3b8">B (field →)</text>
          <text x={cx + 20} y={cy + 6} fontSize="12" fill="#b45309">I (current)</text>
          <text x={W / 2} y={60} fontSize="13" fontWeight="700" textAnchor="middle">Motor effect (Fleming's left-hand rule)</text>
        </g>
      )}
    </g>
  );
}

// ---- Concave lens image ----------------------------------------------------
export function ConcaveLens({ showLabels = true }) {
  const cx = W / 2, ay = H / 2, objX = cx - 220, objTop = ay - 80, f = 120;
  const imgX = cx - 70, imgTop = ay - 34;
  return (
    <g>
      <line x1={80} y1={ay} x2={W - 80} y2={ay} stroke="#94a3b8" strokeWidth="1.5" />
      {/* concave lens (thin middle) */}
      <path d={`M ${cx - 10} ${ay - 110} Q ${cx + 14} ${ay} ${cx - 10} ${ay + 110} M ${cx + 10} ${ay - 110} Q ${cx - 14} ${ay} ${cx + 10} ${ay + 110}`} fill="#bae6fd" fillOpacity="0.5" stroke="#0284c7" strokeWidth="2.5" />
      <circle cx={cx - f} cy={ay} r="3" fill="#64748b" /><text x={cx - f} y={ay + 16} fontSize="10" fill="#64748b" textAnchor="middle">F</text>
      {/* object */}
      <line x1={objX} y1={ay} x2={objX} y2={objTop} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* rays diverge; virtual image (dashed back-projection) */}
      <polyline points={`${objX},${objTop} ${cx},${objTop} ${W - 120},${ay - 130}`} fill="none" stroke="#f59e0b" strokeWidth="1.6" />
      <line x1={cx} y1={objTop} x2={imgX} y2={imgTop} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" />
      <polyline points={`${objX},${objTop} ${W - 120},${ay - 20}`} fill="none" stroke="#dc2626" strokeWidth="1.6" />
      <line x1={imgX} y1={ay} x2={imgX} y2={imgTop} stroke="#7c3aed" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g fill="#334155">
          <text x={objX} y={objTop - 8} fontSize="11" fill="#16a34a" textAnchor="middle">object</text>
          <text x={imgX} y={imgTop - 8} fontSize="10.5" fill="#7c3aed" textAnchor="middle">virtual, upright, smaller</text>
          <text x={cx} y={ay - 116} fontSize="11" fill="#0284c7" textAnchor="middle">concave (diverging) lens</text>
        </g>
      )}
    </g>
  );
}

// ---- Meander & oxbow lake --------------------------------------------------
export function Meander({ showLabels = true }) {
  const y = H / 2;
  return (
    <g>
      <path d={`M 60 ${y} Q 200 ${y - 120} 340 ${y} Q 480 ${y + 120} 620 ${y} Q 720 ${y - 60} ${W - 40} ${y}`} fill="none" stroke="#38bdf8" strokeWidth="30" strokeLinecap="round" />
      {/* erosion (outer) + deposition (inner) markers */}
      <line x1={200} y1={y - 130} x2={200} y2={y - 100} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
      <line x1={340} y1={y + 30} x2={340} y2={y + 8} stroke="#16a34a" strokeWidth="3" />
      {/* oxbow */}
      <path d={`M 470 ${y + 70} q 40 40 80 0`} fill="none" stroke="#7dd3fc" strokeWidth="14" strokeLinecap="round" opacity="0.7" />
      {showLabels && (
        <g fill="#334155">
          <text x={200} y={y - 140} fontSize="11" fill="#dc2626" textAnchor="middle">erosion (outer bank)</text>
          <text x={340} y={y + 54} fontSize="11" fill="#16a34a" textAnchor="middle">deposition (inner bank)</text>
          <text x={510} y={y + 106} fontSize="11" fill="#0284c7" textAnchor="middle">oxbow lake</text>
          <text x={W / 2} y={60} fontSize="13" fontWeight="700" textAnchor="middle">Meander & oxbow lake</text>
        </g>
      )}
    </g>
  );
}

// ---- Coastal features ------------------------------------------------------
export function CoastalFeatures({ showLabels = true }) {
  const sea = H - 120;
  return (
    <g>
      {/* sea */}
      <rect x={40} y={sea} width={W - 80} height={H - sea - 20} fill="#bae6fd" opacity="0.6" />
      {/* headland with arch and stack */}
      <path d={`M 120 ${sea} L 120 ${sea - 140} Q 220 ${sea - 170} 320 ${sea - 120} L 320 ${sea} Z`} fill="#a8a29e" stroke="#57534e" strokeWidth="2" />
      {/* arch */}
      <path d={`M 300 ${sea} q 0 -50 40 -50 q 40 0 40 50 Z`} fill="#bae6fd" opacity="0.6" stroke="#57534e" strokeWidth="2" />
      {/* stack */}
      <path d={`M 440 ${sea} L 450 ${sea - 80} L 480 ${sea - 80} L 490 ${sea} Z`} fill="#a8a29e" stroke="#57534e" strokeWidth="2" />
      {/* cliff on right */}
      <path d={`M ${W - 220} ${sea} L ${W - 220} ${sea - 150} L ${W - 40} ${sea - 150} L ${W - 40} ${sea} Z`} fill="#a8a29e" stroke="#57534e" strokeWidth="2" />
      <rect x={W - 220} y={sea - 10} width="180" height="10" fill="#78716c" />
      {showLabels && (
        <g fill="#334155">
          <Leader x={200} y={sea - 150} tx={110} ty={sea - 170} text="Headland" color="#57534e" side="left" />
          <Leader x={340} y={sea - 50} tx={340} ty={90} text="Arch" color="#57534e" side="right" />
          <Leader x={465} y={sea - 80} tx={W - 60} ty={sea - 120} text="Stack" color="#57534e" side="right" />
          <Leader x={W - 130} y={sea - 10} tx={W - 60} ty={sea - 30} text="Cliff & wave-cut platform" color="#78716c" side="right" />
        </g>
      )}
    </g>
  );
}


// ---- Thermoregulation (negative feedback) ----------------------------------
export function Thermoregulation({ showLabels = true }) {
  const cx = W / 2, cy = 130;
  return (
    <g>
      {/* set-point box */}
      <rect x={cx - 110} y={cy - 34} width="220" height="56" rx="10" fill="#fef9c3" stroke="#ca8a04" strokeWidth="2" />
      {/* hot branch (right) */}
      <path d={`M ${cx + 110} ${cy - 6} Q ${cx + 230} ${cy - 6} ${cx + 230} ${cy + 120}`} fill="none" stroke="#dc2626" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <rect x={cx + 150} y={cy + 130} width="170" height="86" rx="10" fill="#fee2e2" stroke="#dc2626" strokeWidth="2" />
      {/* cold branch (left) */}
      <path d={`M ${cx - 110} ${cy - 6} Q ${cx - 230} ${cy - 6} ${cx - 230} ${cy + 120}`} fill="none" stroke="#2563eb" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      <rect x={cx - 320} y={cy + 130} width="170" height="86" rx="10" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
      {/* return arrows to set point */}
      <path d={`M ${cx + 235} ${cy + 216} Q ${cx + 235} ${cy + 320} ${cx + 20} ${cy + 30}`} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#il-arrow)" />
      <path d={`M ${cx - 235} ${cy + 216} Q ${cx - 235} ${cy + 320} ${cx - 20} ${cy + 30}`} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g fill="#334155">
          <text x={cx} y={cy - 8} fontSize="13" fontWeight="700" textAnchor="middle">Normal body temp (37°C)</text>
          <text x={cx} y={cy + 12} fontSize="10.5" textAnchor="middle" fill="#a16207">hypothalamus monitors blood</text>
          <text x={cx + 235} y={cy + 158} fontSize="12" fontWeight="700" textAnchor="middle" fill="#dc2626">Too hot</text>
          <text x={cx + 235} y={cy + 178} fontSize="10" textAnchor="middle">vasodilation</text>
          <text x={cx + 235} y={cy + 194} fontSize="10" textAnchor="middle">sweating</text>
          <text x={cx + 235} y={cy + 210} fontSize="10" textAnchor="middle">hairs lie flat</text>
          <text x={cx - 235} y={cy + 158} fontSize="12" fontWeight="700" textAnchor="middle" fill="#2563eb">Too cold</text>
          <text x={cx - 235} y={cy + 178} fontSize="10" textAnchor="middle">vasoconstriction</text>
          <text x={cx - 235} y={cy + 194} fontSize="10" textAnchor="middle">shivering</text>
          <text x={cx - 235} y={cy + 210} fontSize="10" textAnchor="middle">hairs stand up</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Thermoregulation — negative feedback</text>
          <text x={cx} y={H - 24} fontSize="10.5" textAnchor="middle" fill="#64748b">corrective response returns temperature to set point</text>
        </g>
      )}
    </g>
  );
}

// ---- Natural selection (peppered moth) -------------------------------------
export function NaturalSelection({ showLabels = true }) {
  const trunk = (x, bark, moths) => (
    <g>
      <rect x={x} y={120} width="160" height="240" rx="8" fill={bark} stroke="#57534e" strokeWidth="2" />
      {moths.map((m, i) => (
        <ellipse key={i} cx={x + m.x} cy={m.y} rx="16" ry="9" fill={m.c} stroke="#1f2937" strokeWidth="1" opacity={m.faint ? 0.35 : 1} />
      ))}
    </g>
  );
  return (
    <g>
      {trunk(80, "#e7e5e4", [
        { x: 40, y: 170, c: "#f5f5f4" },
        { x: 110, y: 250, c: "#f5f5f4" },
        { x: 60, y: 320, c: "#292524", faint: true },
      ])}
      {trunk(W - 240, "#44403c", [
        { x: 50, y: 180, c: "#f5f5f4", faint: true },
        { x: 100, y: 260, c: "#1c1917" },
        { x: 55, y: 330, c: "#1c1917" },
      ])}
      {showLabels && (
        <g fill="#334155">
          <text x={160} y={100} fontSize="12" fontWeight="700" textAnchor="middle">Clean woodland</text>
          <text x={160} y={385} fontSize="10.5" textAnchor="middle">light moths camouflaged → survive</text>
          <text x={W - 160} y={100} fontSize="12" fontWeight="700" textAnchor="middle">Polluted (sooty) woodland</text>
          <text x={W - 160} y={385} fontSize="10.5" textAnchor="middle">dark moths camouflaged → survive</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Natural selection — peppered moth</text>
          <text x={W / 2} y={H - 40} fontSize="10.5" textAnchor="middle" fill="#64748b">better-camouflaged moths avoid predators, reproduce, pass on alleles</text>
          <text x={W / 2} y={H - 22} fontSize="10.5" textAnchor="middle" fill="#64748b">allele frequency in the population shifts over generations</text>
        </g>
      )}
    </g>
  );
}

// ---- Five kingdoms classification ------------------------------------------
export function FiveKingdoms({ showLabels = true }) {
  const cx = W / 2, topY = 90;
  const kingdoms = [
    { name: "Prokaryotae", ex: "bacteria", c: "#fca5a5" },
    { name: "Protista", ex: "amoeba, algae", c: "#fdba74" },
    { name: "Fungi", ex: "mushrooms, yeast", c: "#fde68a" },
    { name: "Plantae", ex: "mosses, trees", c: "#86efac" },
    { name: "Animalia", ex: "insects, mammals", c: "#93c5fd" },
  ];
  const boxW = 128, gap = 12, totalW = kingdoms.length * boxW + (kingdoms.length - 1) * gap;
  const x0 = cx - totalW / 2, boxY = 250;
  return (
    <g>
      <rect x={cx - 70} y={topY} width="140" height="46" rx="10" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
      {kingdoms.map((k, i) => {
        const bx = x0 + i * (boxW + gap);
        return (
          <g key={k.name}>
            <path d={`M ${cx} ${topY + 46} L ${bx + boxW / 2} ${boxY}`} stroke="#94a3b8" strokeWidth="1.6" />
            <rect x={bx} y={boxY} width={boxW} height="88" rx="9" fill={k.c} stroke="#475569" strokeWidth="1.6" />
            {showLabels && (
              <g>
                <text x={bx + boxW / 2} y={boxY + 34} fontSize="12.5" fontWeight="700" textAnchor="middle" fill="#1f2937">{k.name}</text>
                <text x={bx + boxW / 2} y={boxY + 60} fontSize="10" textAnchor="middle" fill="#334155">{k.ex}</text>
              </g>
            )}
          </g>
        );
      })}
      {showLabels && (
        <g fill="#334155">
          <text x={cx} y={topY + 28} fontSize="13" fontWeight="700" textAnchor="middle">Living things</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">The five kingdoms</text>
        </g>
      )}
    </g>
  );
}

// ---- Sarcomere (sliding filament) ------------------------------------------
export function Sarcomere({ showLabels = true }) {
  const row = (y, zGap, label) => {
    const zL = W / 2 - zGap, zR = W / 2 + zGap;
    return (
      <g>
        {/* Z-lines */}
        <line x1={zL} y1={y - 44} x2={zL} y2={y + 44} stroke="#1f2937" strokeWidth="4" />
        <line x1={zR} y1={y - 44} x2={zR} y2={y + 44} stroke="#1f2937" strokeWidth="4" />
        {/* thin actin filaments from each Z-line */}
        {[-30, -14, 14, 30].map((o, i) => (
          <g key={i}>
            <line x1={zL} y1={y + o} x2={zL + zGap * 0.9} y2={y + o} stroke="#f59e0b" strokeWidth="3" />
            <line x1={zR} y1={y + o} x2={zR - zGap * 0.9} y2={y + o} stroke="#f59e0b" strokeWidth="3" />
          </g>
        ))}
        {/* thick myosin filaments (centre) */}
        {[-22, 0, 22].map((o, i) => (
          <line key={i} x1={W / 2 - 60} y1={y + o} x2={W / 2 + 60} y2={y + o} stroke="#7c3aed" strokeWidth="6" strokeLinecap="round" />
        ))}
        {showLabels && <text x={90} y={y + 4} fontSize="12" fontWeight="700" fill="#334155">{label}</text>}
      </g>
    );
  };
  return (
    <g>
      {row(160, 150, "Relaxed")}
      {row(340, 96, "Contracted")}
      {showLabels && (
        <g fill="#334155">
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Sarcomere — sliding filament theory</text>
          <text x={W / 2 - 150} y={120} fontSize="10" textAnchor="middle" fill="#1f2937">Z-line</text>
          <text x={W / 2 + 90} y={200} fontSize="10" fill="#7c3aed">myosin (thick)</text>
          <text x={W / 2 - 130} y={210} fontSize="10" fill="#f59e0b">actin (thin)</text>
          <text x={W / 2} y={H - 60} fontSize="11" textAnchor="middle">Myosin heads pull actin inward → Z-lines move closer</text>
          <text x={W / 2} y={H - 40} fontSize="11" textAnchor="middle">sarcomere shortens (filament lengths unchanged)</text>
        </g>
      )}
    </g>
  );
}

// ---- Eutrophication --------------------------------------------------------
export function Eutrophication({ showLabels = true }) {
  const steps = [
    "Fertiliser / sewage runoff enters water",
    "Nitrates & phosphates enrich the water",
    "Algal bloom covers the surface",
    "Light is blocked → water plants die",
    "Bacteria decompose dead matter",
    "Bacteria use up dissolved O₂",
    "Fish & aquatic animals suffocate",
  ];
  const x = 120, y0 = 90, dy = 52;
  return (
    <g>
      {steps.map((s, i) => {
        const y = y0 + i * dy;
        const col = i < 2 ? "#86efac" : i < 4 ? "#6ee7b7" : i < 6 ? "#fbbf24" : "#f87171";
        return (
          <g key={i}>
            <rect x={x} y={y} width={W - 2 * x} height="38" rx="8" fill={col} fillOpacity="0.6" stroke="#475569" strokeWidth="1.4" />
            {i < steps.length - 1 && <line x1={W / 2} y1={y + 38} x2={W / 2} y2={y + dy} stroke="#64748b" strokeWidth="2" markerEnd="url(#il-arrow)" />}
            {showLabels && <text x={W / 2} y={y + 24} fontSize="11.5" fontWeight="600" textAnchor="middle" fill="#1f2937">{s}</text>}
          </g>
        );
      })}
      {showLabels && <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle" fill="#334155">Eutrophication</text>}
    </g>
  );
}

// ---- Vaccination / immune memory -------------------------------------------
export function Vaccination({ showLabels = true }) {
  return (
    <g>
      {/* vaccine syringe */}
      <rect x={70} y={130} width="90" height="24" rx="4" fill="#e2e8f0" stroke="#475569" strokeWidth="1.6" />
      <line x1={160} y1={142} x2={200} y2={142} stroke="#475569" strokeWidth="3" markerEnd="url(#il-arrow)" />
      <circle cx={120} cy={142} r="7" fill="#a78bfa" />
      {/* B cell */}
      <circle cx={300} cy={200} r="46" fill="#bfdbfe" stroke="#2563eb" strokeWidth="2" />
      <circle cx={300} cy={200} r="18" fill="#60a5fa" />
      <line x1={200} y1={142} x2={262} y2={185} stroke="#94a3b8" strokeWidth="2" markerEnd="url(#il-arrow)" />
      {/* memory cells + antibodies */}
      <circle cx={520} cy={130} r="34" fill="#ddd6fe" stroke="#7c3aed" strokeWidth="2" />
      <circle cx={560} cy={280} r="30" fill="#fde68a" stroke="#ca8a04" strokeWidth="2" />
      <line x1={346} y1={190} x2={488} y2={140} stroke="#94a3b8" strokeWidth="2" markerEnd="url(#il-arrow)" />
      <line x1={346} y1={215} x2={532} y2={270} stroke="#94a3b8" strokeWidth="2" markerEnd="url(#il-arrow)" />
      {/* Y antibodies */}
      {[[620, 320], [660, 350], [600, 370]].map(([ax, ay], i) => (
        <text key={i} x={ax} y={ay} fontSize="20" fontWeight="800" fill="#ca8a04">Y</text>
      ))}
      {showLabels && (
        <g fill="#334155">
          <text x={115} y={122} fontSize="11" textAnchor="middle">vaccine (dead/weakened antigen)</text>
          <text x={300} y={262} fontSize="11" fontWeight="700" textAnchor="middle" fill="#2563eb">B-lymphocyte</text>
          <text x={520} y={90} fontSize="11" fontWeight="700" textAnchor="middle" fill="#7c3aed">memory cells</text>
          <text x={560} y={324} fontSize="11" fontWeight="700" textAnchor="middle" fill="#ca8a04">antibodies</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Vaccination & immune memory</text>
          <text x={W / 2} y={H - 30} fontSize="10.5" textAnchor="middle" fill="#64748b">on re-infection memory cells produce antibodies faster & in greater numbers</text>
        </g>
      )}
    </g>
  );
}

// ---- Collision theory ------------------------------------------------------
export function CollisionTheory({ showLabels = true }) {
  const gx = 120, gy0 = 360, gx1 = W - 90, gy1 = 110;
  return (
    <g>
      {/* successful vs unsuccessful collision (top) */}
      <g>
        <circle cx={180} cy={130} r="18" fill="#60a5fa" /><circle cx={230} cy={130} r="18" fill="#f59e0b" />
        <line x1={198} y1={130} x2={212} y2={130} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
        <circle cx={430} cy={130} r="18" fill="#60a5fa" /><circle cx={480} cy={130} r="18" fill="#f59e0b" />
        <path d="M 448 130 q 7 0 14 0" fill="none" stroke="#dc2626" strokeWidth="3" />
      </g>
      {/* energy profile graph */}
      <line x1={gx} y1={gy0} x2={gx1} y2={gy0} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#il-arrow)" />
      <line x1={gx} y1={gy0} x2={gx} y2={gy1} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#il-arrow)" />
      <path d={`M ${gx + 20} ${gy0 - 40} L ${gx + 180} ${gy0 - 40} Q ${gx + 260} ${gy0 - 40} ${gx + 280} ${gy1 + 30} Q ${gx + 300} ${gy0 - 40} ${gx + 380} ${gy0 - 90} L ${gx1 - 20} ${gy0 - 90}`} fill="none" stroke="#dc2626" strokeWidth="3" />
      <line x1={gx} y1={gy1 + 30} x2={gx + 280} y2={gy1 + 30} stroke="#7c3aed" strokeWidth="1" strokeDasharray="4 3" />
      {showLabels && (
        <g fill="#334155">
          <text x={205} y={100} fontSize="10.5" fontWeight="700" textAnchor="middle" fill="#16a34a">successful (enough energy + correct orientation)</text>
          <text x={455} y={100} fontSize="10.5" fontWeight="700" textAnchor="middle" fill="#dc2626">unsuccessful (too little energy)</text>
          <text x={gx + 280} y={gy1 + 20} fontSize="10.5" textAnchor="middle" fill="#7c3aed">activation energy (Eₐ)</text>
          <text x={(gx + gx1) / 2} y={gy0 + 24} fontSize="11" textAnchor="middle">progress of reaction</text>
          <text x={gx - 14} y={(gy0 + gy1) / 2} fontSize="11" textAnchor="middle" transform={`rotate(-90 ${gx - 14} ${(gy0 + gy1) / 2})`}>energy</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Collision theory</text>
        </g>
      )}
    </g>
  );
}

// ---- Dynamic equilibrium / Le Chatelier ------------------------------------
export function Equilibrium({ showLabels = true }) {
  const cx = W / 2, cy = 200;
  return (
    <g>
      <rect x={cx - 130} y={cy - 44} width="120" height="70" rx="10" fill="#bfdbfe" stroke="#2563eb" strokeWidth="2" />
      <rect x={cx + 10} y={cy - 44} width="120" height="70" rx="10" fill="#fde68a" stroke="#ca8a04" strokeWidth="2" />
      {/* forward + reverse arrows */}
      <line x1={cx - 6} y1={cy - 24} x2={cx + 6} y2={cy - 24} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
      <line x1={cx + 6} y1={cy + 6} x2={cx - 6} y2={cy + 6} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {/* rate vs time graph */}
      <line x1={140} y1={H - 70} x2={W - 100} y2={H - 70} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#il-arrow)" />
      <line x1={140} y1={H - 70} x2={140} y2={H - 190} stroke="currentColor" strokeWidth="1.5" markerEnd="url(#il-arrow)" />
      <path d={`M 140 ${H - 100} Q 260 ${H - 140} 460 ${H - 140} L ${W - 110} ${H - 140}`} fill="none" stroke="#16a34a" strokeWidth="2.5" />
      <path d={`M 140 ${H - 180} Q 260 ${H - 140} 460 ${H - 140} L ${W - 110} ${H - 140}`} fill="none" stroke="#dc2626" strokeWidth="2.5" />
      {showLabels && (
        <g fill="#334155">
          <text x={cx - 70} y={cy - 4} fontSize="14" fontWeight="700" textAnchor="middle" fill="#2563eb">reactants</text>
          <text x={cx + 70} y={cy - 4} fontSize="14" fontWeight="700" textAnchor="middle" fill="#ca8a04">products</text>
          <text x={cx} y={cy + 52} fontSize="11" textAnchor="middle">rate forward = rate reverse (closed system)</text>
          <text x={460} y={H - 148} fontSize="10.5" textAnchor="middle">equilibrium reached</text>
          <text x={(140 + W - 100) / 2} y={H - 48} fontSize="11" textAnchor="middle">time</text>
          <text x={126} y={H - 130} fontSize="11" textAnchor="middle" transform={`rotate(-90 126 ${H - 130})`}>rate</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Dynamic equilibrium</text>
        </g>
      )}
    </g>
  );
}

// ---- Alloys vs pure metals -------------------------------------------------
export function Alloys({ showLabels = true }) {
  const grid = (x0, y0, extra) => {
    const rows = 5, cols = 6, gap = 26, r = 11;
    const dots = [];
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        const big = extra && (ri + ci) % 4 === 0;
        dots.push(
          <circle key={`${ri}-${ci}`} cx={x0 + ci * gap} cy={y0 + ri * gap} r={big ? r + 5 : r} fill={big ? "#f59e0b" : "#94a3b8"} stroke="#475569" strokeWidth="1.2" />
        );
      }
    }
    return <g>{dots}</g>;
  };
  return (
    <g>
      <rect x={90} y={110} width="200" height="180" rx="8" fill="#f8fafc" stroke="#475569" strokeWidth="1.5" />
      {grid(120, 140, false)}
      <rect x={W - 290} y={110} width="200" height="180" rx="8" fill="#f8fafc" stroke="#475569" strokeWidth="1.5" />
      {grid(W - 260, 140, true)}
      {/* slip arrows */}
      <line x1={130} y1={310} x2={250} y2={310} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
      <line x1={W - 250} y1={310} x2={W - 210} y2={310} stroke="#dc2626" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g fill="#334155">
          <text x={190} y={100} fontSize="12" fontWeight="700" textAnchor="middle">Pure metal</text>
          <text x={190} y={338} fontSize="10.5" textAnchor="middle" fill="#16a34a">uniform atoms → layers slide easily (soft)</text>
          <text x={W - 190} y={100} fontSize="12" fontWeight="700" textAnchor="middle">Alloy</text>
          <text x={W - 190} y={338} fontSize="10.5" textAnchor="middle" fill="#dc2626">different-size atoms distort layers → harder</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Alloys vs pure metals</text>
        </g>
      )}
    </g>
  );
}

// ---- Displacement reaction -------------------------------------------------
export function DisplacementReaction({ showLabels = true }) {
  const beaker = (x, sol, strip, stripC, deposit) => (
    <g>
      <path d={`M ${x} 150 L ${x} 330 Q ${x} 350 ${x + 20} 350 L ${x + 120} 350 Q ${x + 140} 350 ${x + 140} 330 L ${x + 140} 150`} fill="none" stroke="#475569" strokeWidth="2.5" />
      <path d={`M ${x + 4} 200 L ${x + 4} 328 Q ${x + 4} 346 ${x + 22} 346 L ${x + 118} 346 Q ${x + 136} 346 ${x + 136} 328 L ${x + 136} 200 Z`} fill={sol} fillOpacity="0.55" />
      <rect x={x + 62} y={170} width="16" height="150" fill={stripC} stroke="#334155" strokeWidth="1.2" />
      {deposit && <rect x={x + 58} y={200} width="24" height="120" fill="#f97316" opacity="0.7" />}
    </g>
  );
  return (
    <g>
      {beaker(120, "#93c5fd", true, "#cbd5e1", false)}
      <line x1={300} y1={250} x2={W - 300} y2={250} stroke="#334155" strokeWidth="3" markerEnd="url(#il-arrow)" />
      {beaker(W - 260, "#e5e7eb", true, "#cbd5e1", true)}
      {showLabels && (
        <g fill="#334155">
          <text x={190} y={140} fontSize="11.5" fontWeight="700" textAnchor="middle">zinc in copper(II) sulfate</text>
          <text x={190} y={372} fontSize="10.5" textAnchor="middle" fill="#2563eb">blue solution</text>
          <text x={W - 190} y={140} fontSize="11.5" fontWeight="700" textAnchor="middle">after reaction</text>
          <text x={W - 190} y={372} fontSize="10.5" textAnchor="middle" fill="#f97316">copper coats zinc; solution fades</text>
          <text x={W / 2} y={230} fontSize="10.5" textAnchor="middle">Zn + CuSO₄ →</text>
          <text x={W / 2} y={246} fontSize="10.5" textAnchor="middle">ZnSO₄ + Cu</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Displacement reaction</text>
          <text x={W / 2} y={H - 26} fontSize="10.5" textAnchor="middle" fill="#64748b">a more reactive metal displaces a less reactive one from solution</text>
        </g>
      )}
    </g>
  );
}


// ---- Stopping distance -----------------------------------------------------
export function StoppingDistance({ showLabels = true }) {
  const rows = [
    { speed: "30 mph", think: 60, brake: 45 },
    { speed: "50 mph", think: 100, brake: 125 },
    { speed: "70 mph", think: 140, brake: 245 },
  ];
  const x0 = 150, y0 = 130, dy = 90, scale = 0.9;
  return (
    <g>
      {rows.map((r, i) => {
        const y = y0 + i * dy;
        const tw = r.think * scale, bw = r.brake * scale;
        return (
          <g key={i}>
            <rect x={x0} y={y} width={tw} height="34" fill="#60a5fa" stroke="#1e3a8a" strokeWidth="1" />
            <rect x={x0 + tw} y={y} width={bw} height="34" fill="#f87171" stroke="#7f1d1d" strokeWidth="1" />
            {showLabels && (
              <g fill="#334155">
                <text x={x0 - 12} y={y + 22} fontSize="12" fontWeight="700" textAnchor="end">{r.speed}</text>
                <text x={x0 + tw + bw + 8} y={y + 22} fontSize="10.5">{r.think + r.brake} ft total</text>
              </g>
            )}
          </g>
        );
      })}
      {showLabels && (
        <g fill="#334155">
          <rect x={x0} y={H - 70} width="16" height="16" fill="#60a5fa" /><text x={x0 + 22} y={H - 57} fontSize="11">thinking distance (∝ speed)</text>
          <rect x={x0 + 220} y={H - 70} width="16" height="16" fill="#f87171" /><text x={x0 + 242} y={H - 57} fontSize="11">braking distance (∝ speed²)</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Stopping distance vs speed</text>
        </g>
      )}
    </g>
  );
}

// ---- Diffraction -----------------------------------------------------------
export function Diffraction({ showLabels = true }) {
  const cx = W / 2, gapY = H / 2, gap = 40;
  return (
    <g>
      {/* barrier with a gap */}
      <rect x={cx - 8} y={70} width="16" height={gapY - gap - 70} fill="#475569" />
      <rect x={cx - 8} y={gapY + gap} width="16" height={H - 90 - (gapY + gap)} fill="#475569" />
      {/* plane wavefronts approaching (left) */}
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={`p${i}`} x1={120 + i * 40} y1={90} x2={120 + i * 40} y2={H - 90} stroke="#0ea5e9" strokeWidth="2.5" opacity="0.8" />
      ))}
      {/* circular wavefronts spreading after the gap (right) */}
      {[1, 2, 3, 4, 5].map((i) => (
        <path key={`c${i}`} d={`M ${cx + 8} ${gapY - i * 34} A ${i * 34} ${i * 34} 0 0 1 ${cx + 8} ${gapY + i * 34}`} fill="none" stroke="#16a34a" strokeWidth="2.5" opacity="0.8" />
      ))}
      <line x1={200} y1={H / 2} x2={cx - 30} y2={H / 2} stroke="#334155" strokeWidth="2" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g fill="#334155">
          <text x={200} y={78} fontSize="11" textAnchor="middle" fill="#0ea5e9">straight wavefronts</text>
          <text x={cx + 130} y={78} fontSize="11" textAnchor="middle" fill="#16a34a">waves spread out (diffract)</text>
          <text x={cx + 60} y={gapY + 6} fontSize="10.5" fill="#64748b">gap ≈ wavelength → most spreading</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Diffraction through a gap</text>
        </g>
      )}
    </g>
  );
}

// ---- Momentum / conservation -----------------------------------------------
export function Momentum({ showLabels = true }) {
  const yTop = 150, yBot = 340;
  return (
    <g>
      {/* before */}
      <line x1={80} y1={yTop + 40} x2={W - 80} y2={yTop + 40} stroke="#cbd5e1" strokeWidth="2" />
      <circle cx={220} cy={yTop} r="30" fill="#60a5fa" stroke="#1e3a8a" strokeWidth="2" />
      <circle cx={430} cy={yTop} r="22" fill="#f59e0b" stroke="#92400e" strokeWidth="2" />
      <line x1={256} y1={yTop} x2={330} y2={yTop} stroke="#16a34a" strokeWidth="4" markerEnd="url(#il-arrow)" />
      {/* after */}
      <line x1={80} y1={yBot + 40} x2={W - 80} y2={yBot + 40} stroke="#cbd5e1" strokeWidth="2" />
      <circle cx={340} cy={yBot} r="30" fill="#60a5fa" stroke="#1e3a8a" strokeWidth="2" />
      <circle cx={520} cy={yBot} r="22" fill="#f59e0b" stroke="#92400e" strokeWidth="2" />
      <line x1={382} y1={yBot} x2={430} y2={yBot} stroke="#16a34a" strokeWidth="3" markerEnd="url(#il-arrow)" />
      <line x1={548} y1={yBot} x2={640} y2={yBot} stroke="#16a34a" strokeWidth="5" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g fill="#334155">
          <text x={110} y={yTop + 6} fontSize="13" fontWeight="700">Before</text>
          <text x={110} y={yBot + 6} fontSize="13" fontWeight="700">After</text>
          <text x={290} y={yTop - 44} fontSize="10.5" textAnchor="middle" fill="#16a34a">moving</text>
          <text x={430} y={yTop - 34} fontSize="10.5" textAnchor="middle">stationary</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Conservation of momentum</text>
          <text x={W / 2} y={H - 30} fontSize="11" textAnchor="middle" fill="#64748b">total momentum before = total momentum after (m₁u₁ + m₂u₂ = m₁v₁ + m₂v₂)</text>
        </g>
      )}
    </g>
  );
}

// ---- National grid ---------------------------------------------------------
export function NationalGrid({ showLabels = true }) {
  const y = 230;
  const pylon = (x) => (
    <g stroke="#57534e" strokeWidth="2.5" fill="none">
      <path d={`M ${x - 22} ${y + 70} L ${x} ${y - 30} L ${x + 22} ${y + 70}`} />
      <line x1={x - 16} y1={y + 40} x2={x + 16} y2={y + 40} />
      <line x1={x - 20} y1={y + 6} x2={x + 20} y2={y + 6} />
    </g>
  );
  return (
    <g>
      {/* power station */}
      <rect x={70} y={y - 10} width="90" height="90" fill="#94a3b8" stroke="#334155" strokeWidth="2" />
      <path d="M 100 210 q 10 -20 20 0" fill="none" stroke="#94a3b8" strokeWidth="6" />
      {/* step-up transformer */}
      <rect x={190} y={y + 10} width="54" height="54" rx="6" fill="#fca5a5" stroke="#b91c1c" strokeWidth="2" />
      {/* pylons + cables */}
      {pylon(340)}{pylon(470)}
      <line x1={244} y1={y + 20} x2={340} y2={y + 6} stroke="#eab308" strokeWidth="2.5" />
      <line x1={340} y1={y + 6} x2={470} y2={y + 6} stroke="#eab308" strokeWidth="2.5" />
      <line x1={470} y1={y + 6} x2={560} y2={y + 20} stroke="#eab308" strokeWidth="2.5" />
      {/* step-down transformer + houses */}
      <rect x={560} y={y + 10} width="54" height="54" rx="6" fill="#93c5fd" stroke="#1d4ed8" strokeWidth="2" />
      <path d={`M ${W - 120} ${y + 80} L ${W - 120} ${y + 30} L ${W - 90} ${y + 10} L ${W - 60} ${y + 30} L ${W - 60} ${y + 80} Z`} fill="#fde68a" stroke="#a16207" strokeWidth="2" />
      <line x1={614} y1={y + 40} x2={W - 120} y2={y + 55} stroke="#eab308" strokeWidth="2" />
      {showLabels && (
        <g fill="#334155">
          <text x={115} y={y - 20} fontSize="11" fontWeight="700" textAnchor="middle">power station</text>
          <text x={217} y={y - 2} fontSize="10" textAnchor="middle" fill="#b91c1c">step-up</text>
          <text x={405} y={y - 44} fontSize="10.5" textAnchor="middle">very high voltage → low current → less heat loss</text>
          <text x={587} y={y - 2} fontSize="10" textAnchor="middle" fill="#1d4ed8">step-down</text>
          <text x={W - 90} y={y - 8} fontSize="11" fontWeight="700" textAnchor="middle">homes</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">The National Grid</text>
        </g>
      )}
    </g>
  );
}

// ---- Radiation penetration -------------------------------------------------
export function RadiationPenetration({ showLabels = true }) {
  const src = 120;
  const rows = [
    { y: 150, c: "#dc2626", name: "alpha (α)", stopAt: 300, barrier: "paper" },
    { y: 250, c: "#2563eb", name: "beta (β)", stopAt: 470, barrier: "aluminium" },
    { y: 350, c: "#16a34a", name: "gamma (γ)", stopAt: W - 120, barrier: "thick lead" },
  ];
  const barriers = [{ x: 300, label: "paper" }, { x: 470, label: "aluminium" }, { x: W - 120, label: "lead" }];
  return (
    <g>
      <circle cx={src} cy={250} r="22" fill="#fbbf24" stroke="#b45309" strokeWidth="2" />
      {barriers.map((b, i) => (
        <rect key={i} x={b.x} y={110} width={b.label === "lead" ? 22 : b.label === "aluminium" ? 12 : 5} height="290" fill={b.label === "lead" ? "#64748b" : b.label === "aluminium" ? "#cbd5e1" : "#fef3c7"} stroke="#334155" strokeWidth="1.4" />
      ))}
      {rows.map((r, i) => (
        <g key={i}>
          <line x1={src + 22} y1={r.y} x2={r.stopAt} y2={r.y} stroke={r.c} strokeWidth="3.5" markerEnd="url(#il-arrow)" />
          {showLabels && <text x={src + 30} y={r.y - 8} fontSize="11" fontWeight="700" fill={r.c}>{r.name}</text>}
        </g>
      ))}
      {showLabels && (
        <g fill="#334155">
          <text x={302} y={420} fontSize="10.5" textAnchor="middle">paper</text>
          <text x={476} y={420} fontSize="10.5" textAnchor="middle">few mm aluminium</text>
          <text x={W - 108} y={420} fontSize="10.5" textAnchor="middle">thick lead / concrete</text>
          <text x={src} y={300} fontSize="10.5" textAnchor="middle">source</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Penetrating power of radiation</text>
        </g>
      )}
    </g>
  );
}

// ---- Glacial features ------------------------------------------------------
export function GlacialFeatures({ showLabels = true }) {
  return (
    <g>
      {/* mountain massif */}
      <path d={`M 60 ${H - 90} L 230 140 L 360 260 L 470 150 L ${W - 60} ${H - 90} Z`} fill="#a8a29e" stroke="#57534e" strokeWidth="2" />
      {/* pyramidal peak snow */}
      <path d="M 230 140 L 200 210 L 262 210 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
      {/* corrie (armchair hollow) with tarn */}
      <path d="M 300 300 q 40 -60 100 -20 q -20 60 -100 40 Z" fill="#bae6fd" stroke="#0369a1" strokeWidth="1.5" opacity="0.8" />
      {/* U-shaped valley (front cross-section) */}
      <path d={`M 90 ${H - 90} Q 90 ${H - 40} 220 ${H - 40} L ${W - 220} ${H - 40} Q ${W - 90} ${H - 40} ${W - 90} ${H - 90}`} fill="#d9f99d" stroke="#4d7c0f" strokeWidth="2" />
      {showLabels && (
        <g fill="#334155">
          <Leader x={230} y={150} tx={140} ty={110} text="Pyramidal peak" color="#57534e" side="left" />
          <Leader x={360} y={255} tx={470} ty={150} text="Arête (knife ridge)" color="#57534e" side="right" />
          <Leader x={350} y={310} tx={470} ty={300} text="Corrie & tarn" color="#0369a1" side="right" />
          <text x={W / 2} y={H - 55} fontSize="11" fontWeight="700" textAnchor="middle" fill="#4d7c0f">U-shaped (glacial trough) valley</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Glacial landforms</text>
        </g>
      )}
    </g>
  );
}

// ---- Waterfall & gorge -----------------------------------------------------
export function Waterfall({ showLabels = true }) {
  const topY = 150, lipX = 380;
  return (
    <g>
      {/* hard rock cap (left, upper) */}
      <rect x={120} y={topY} width={lipX - 120} height="40" fill="#78716c" stroke="#44403c" strokeWidth="2" />
      {/* soft rock beneath (undercut) */}
      <rect x={120} y={topY + 40} width={lipX - 150} height="120" fill="#d6d3d1" stroke="#a8a29e" strokeWidth="1.5" />
      {/* river on top */}
      <rect x={120} y={topY - 16} width={lipX - 120} height="16" fill="#38bdf8" />
      {/* falling water */}
      <path d={`M ${lipX} ${topY - 16} L ${lipX} ${topY + 200} L ${lipX - 34} ${topY + 200} L ${lipX - 34} ${topY}`} fill="#7dd3fc" opacity="0.85" />
      {/* plunge pool */}
      <ellipse cx={lipX + 30} cy={topY + 210} rx="90" ry="26" fill="#0ea5e9" opacity="0.7" />
      {/* gorge downstream */}
      <rect x={lipX + 30} y={topY + 200} width={W - 90 - (lipX + 30)} height="24" fill="#38bdf8" />
      {showLabels && (
        <g fill="#334155">
          <Leader x={250} y={topY + 20} tx={180} ty={topY - 36} text="Hard rock (cap)" color="#44403c" side="left" />
          <Leader x={240} y={topY + 100} tx={150} ty={topY + 130} text="Soft rock (undercut)" color="#a8a29e" side="left" />
          <Leader x={lipX + 30} y={topY + 210} tx={lipX + 150} ty={topY + 250} text="Plunge pool" color="#0369a1" side="right" />
          <text x={(lipX + 30 + W - 90) / 2} y={topY + 250} fontSize="10.5" textAnchor="middle" fill="#0369a1">gorge (retreats upstream)</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Waterfall formation</text>
        </g>
      )}
    </g>
  );
}

// ---- Longshore drift -------------------------------------------------------
export function LongshoreDrift({ showLabels = true }) {
  const beachY = 300;
  return (
    <g>
      {/* sea (top) + beach (bottom) */}
      <rect x={40} y={90} width={W - 80} height={beachY - 90} fill="#bae6fd" opacity="0.55" />
      <rect x={40} y={beachY} width={W - 80} height={H - beachY - 30} fill="#fde68a" opacity="0.6" />
      <line x1={40} y1={beachY} x2={W - 40} y2={beachY} stroke="#ca8a04" strokeWidth="2" />
      {/* prevailing wind arrow */}
      <line x1={90} y1={130} x2={190} y2={170} stroke="#64748b" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
      {/* zigzag sediment path: angled swash up, straight backwash down */}
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 120 + i * 120;
        return (
          <g key={i}>
            <line x1={x} y1={beachY} x2={x + 70} y2={beachY - 46} stroke="#0284c7" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
            <line x1={x + 70} y1={beachY - 46} x2={x + 70} y2={beachY} stroke="#16a34a" strokeWidth="2.5" markerEnd="url(#il-arrow)" />
          </g>
        );
      })}
      {/* net drift arrow along beach */}
      <line x1={110} y1={beachY + 60} x2={W - 110} y2={beachY + 60} stroke="#dc2626" strokeWidth="4" markerEnd="url(#il-arrow)" />
      {showLabels && (
        <g fill="#334155">
          <text x={150} y={120} fontSize="11" fill="#64748b">prevailing wind</text>
          <text x={200} y={beachY - 54} fontSize="10.5" fill="#0284c7">swash (angled)</text>
          <text x={300} y={beachY - 12} fontSize="10.5" fill="#16a34a">backwash (straight down)</text>
          <text x={W / 2} y={beachY + 84} fontSize="11" fontWeight="700" textAnchor="middle" fill="#dc2626">net movement of sediment along the coast</text>
          <text x={W / 2} y={40} fontSize="14" fontWeight="800" textAnchor="middle">Longshore drift</text>
        </g>
      )}
    </g>
  );
}
