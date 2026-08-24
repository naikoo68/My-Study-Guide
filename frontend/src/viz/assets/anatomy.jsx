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
