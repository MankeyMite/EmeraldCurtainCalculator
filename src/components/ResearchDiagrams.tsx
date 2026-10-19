import { useState } from "react";
import { describeByte } from "../core/inspection";
import { hex } from "../core/pokemon";

export function NibbleExample() {
  const [byte, setByte] = useState(0xa0);
  return (
    <figure className="research-figure">
      <label>
        Conventional hexadecimal byte
        <select value={byte} onChange={(e) => setByte(Number(e.target.value))}>
          {[0xa0, 0x0a, 0x00, 0xff, 0x01, 0x10].map((n) => (
            <option key={n} value={n}>
              0x{hex(n)}
            </option>
          ))}
        </select>
      </label>
      <div className="research-pixel-pair" aria-live="polite">
        {[byte & 15, byte >>> 4].map((n, i) => (
          <div key={i}>
            <span className={`example-pixel ${n ? "opaque" : "transparent"}`} />
            <strong>
              {i ? "High" : "Low"} nibble: {hex(n, 1)}
            </strong>
            <span>{n ? "Black" : "Transparent"}</span>
          </div>
        ))}
      </div>
      <figcaption>
        Raw GBA display order → low, then high. Hex notation writes high, then
        low. Mirrored tiles reverse the displayed direction.
      </figcaption>
    </figure>
  );
}

export function XorExample() {
  const [plain, setPlain] = useState(10),
    [key, setKey] = useState(10);
  const cipher = plain ^ key;
  return (
    <figure className="research-figure">
      <div className="research-xor-controls">
        {(
          [
            ["Plaintext nibble", plain, setPlain],
            ["Key nibble", key, setKey],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label}>
            {label}
            <select value={value} onChange={(e) => set(Number(e.target.value))}>
              {Array.from({ length: 16 }, (_, n) => (
                <option key={n} value={n}>
                  {hex(n, 1)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <output className="research-equation" aria-live="polite">
        {hex(plain, 1)} XOR {hex(key, 1)} = {hex(cipher, 1)} →{" "}
        {cipher ? "black" : "transparent"}
        <small>
          {plain.toString(2).padStart(4, "0")} XOR{" "}
          {key.toString(2).padStart(4, "0")} ={" "}
          {cipher.toString(2).padStart(4, "0")}
        </small>
      </output>
      <figcaption>
        Try plaintext 5 with key A: ciphertext F is black. Changing plaintext to
        A makes ciphertext 0 transparent. XORing the ciphertext with A recovers
        the original plaintext.
      </figcaption>
    </figure>
  );
}

export function RecordDiagram() {
  const [pid, setPid] = useState(0),
    [offset, setOffset] = useState(0);
  const field = describeByte(offset, pid);
  const group = (n: number) =>
    n < 4
      ? "pid"
      : n < 8
        ? "otid"
        : n < 32
          ? "header"
          : `block-${Math.floor((n - 32) / 12)}`;
  return (
    <figure className="research-figure record-explorer">
      <label>
        Illustrative PID remainder (PID % 24)
        <select value={pid} onChange={(e) => setPid(Number(e.target.value))}>
          {Array.from({ length: 24 }, (_, n) => (
            <option value={n} key={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="research-caption">
        Explore byte addresses, not recovered values. This example never changes
        your investigation.
      </p>
      <div className="research-record-layout">
        <div
          className="research-byte-map"
          aria-label="80-byte record address diagram"
        >
          {Array.from({ length: 80 }, (_, n) => {
            const f = describeByte(n, pid);
            return (
              <button
                type="button"
                key={n}
                className={`record-${group(n)}`}
                aria-pressed={offset === n}
                aria-label={`Byte 0x${hex(n)}: ${f.block}, ${f.name}`}
                title={`0x${hex(n)} · ${f.block} · ${f.name}`}
                onMouseEnter={() => setOffset(n)}
                onFocus={() => setOffset(n)}
                onClick={() => setOffset(n)}
              >
                {hex(n)}
              </button>
            );
          })}
        </div>
        <div>
          <div className="research-mini-curtain" aria-hidden="true">
            {Array.from({ length: 160 }, (_, n) => (
              <span
                key={n}
                className={Math.floor(n / 2) === offset ? "address-active" : ""}
              />
            ))}
          </div>
          <p className="research-caption">
            8 × 20
            <br />
            main-record pixels
          </p>
        </div>
      </div>
      <div className="research-address" aria-live="polite">
        <strong>
          Byte 0x{hex(offset)} · {field.name}
        </strong>
        <span>
          {field.block} · {field.encrypted ? "XOR encrypted" : "unencrypted"}
        </span>
        <span>
          Low nibble: row {Math.floor(offset / 4) + 1}, column{" "}
          {(offset % 4) * 2 + 1}. High nibble: same row, column{" "}
          {(offset % 4) * 2 + 2}.
        </span>
      </div>
      <figcaption>
        Hover, focus or click an address to highlight its two pixels. Rows and
        columns are one-based within the main-record strip; neighboring records
        are excluded. Secure-block labels change with the selected permutation.
      </figcaption>
    </figure>
  );
}

export function SidIntersectionDiagram() {
  return (
    <figure className="research-figure">
      <svg
        viewBox="0 0 520 205"
        role="img"
        aria-labelledby="sid-intersection-title sid-intersection-desc"
        className="research-set-diagram"
      >
        <title id="sid-intersection-title">
          Intersecting two independently derived SID sets
        </title>
        <desc id="sid-intersection-desc">
          Curtain-compatible candidates overlap TID-seeded RNG candidates. Only
          members of both sets survive. Circle areas do not represent candidate
          counts.
        </desc>
        <ellipse
          cx="200"
          cy="87"
          rx="135"
          ry="77"
          fill="#e8f2e8"
          stroke="#477559"
        />
        <ellipse
          cx="320"
          cy="87"
          rx="135"
          ry="77"
          fill="#deeef0"
          fillOpacity="0.65"
          stroke="#477780"
        />
        <text x="147" y="78">
          Curtain
        </text>
        <text x="147" y="99">
          constraints
        </text>
        <text x="373" y="78">
          New-game
        </text>
        <text x="373" y="99">
          RNG window
        </text>
        <text x="260" y="82" className="intersection-label">
          Both
        </text>
        <text x="260" y="103" className="intersection-label">
          survive
        </text>
        <text x="260" y="192">
          Actual set intersection · diagram not to scale
        </text>
      </svg>
      <figcaption>
        A candidate must pass both tests. A smaller result is useful only if the
        chosen window and supplied facts include the truth.
      </figcaption>
    </figure>
  );
}
