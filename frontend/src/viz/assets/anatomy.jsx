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
  const topX = W / 2 - 90, botX = W / 2 - 150, colTop = 70, colBot = H - 70, w1 = 180, w2 = 300;
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
