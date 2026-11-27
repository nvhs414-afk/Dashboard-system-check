import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CalendarCheck, FileCheck2, FileText, Package, Ship } from "lucide-react";

const SRC_HD = "./assets/freight-hd.mp4";
const SRC_SD = "./assets/freight-sd.mp4";
const POSTER = "./assets/freight-poster.jpg";

const A = 2.4; // viewports spent scrubbing the clip
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

const cards = [
  {
    Icon: FileText,
    title: ["Commercial", "Invoice"],
    body: "Đọc số invoice, người bán, người mua, trị giá và điều kiện giao hàng từ PDF, Excel hoặc ảnh.",
  },
  {
    Icon: Package,
    title: ["Packing", "List"],
    body: "Đối chiếu số kiện, trọng lượng Net/Gross, container và seal với Invoice và B/L.",
  },
  {
    Icon: CalendarCheck,
    title: ["Booking", "& lịch tàu"],
    body: "Theo dõi ETD, cut-off, POL/POD và thời gian free time để không lỡ chuyến.",
  },
  {
    Icon: Ship,
    title: ["Bill of", "Lading"],
    body: "Kiểm tra Shipper, Consignee, số container, seal và cảng so với bộ chứng từ thương mại.",
  },
  {
    Icon: FileCheck2,
    title: ["Bản nháp", "C/O"],
    body: "Tổng hợp dữ liệu đã xác nhận thành bản nháp C/O để nhân viên rà soát trước khi nộp.",
  },
];

/** Scroll-scrubbed freight intro: container handling clip, rising band, sliding title and strip. */
export function FreightHero() {
  const trackRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lettersRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const track = trackRef.current,
      scene = sceneRef.current,
      video = videoRef.current;
    const letters = lettersRef.current,
      strip = stripRef.current,
      speed = speedRef.current;
    if (!track || !scene || !video || !letters || !strip || !speed) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      track.classList.add("is-static");
      return;
    }

    let vw = 0,
      vh = 0,
      stripW = 0,
      lettersW = 0,
      B = 1,
      raf = 0;
    let cur = 0,
      seeking = false,
      lastY = window.scrollY,
      lastT = performance.now(),
      spd = 0;
    const cardEls = Array.from(strip.querySelectorAll<HTMLElement>(".fh-card"));

    const layout = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      const phone = vw < 768 || vw <= vh;
      const u = phone ? Math.min(vw / 430, 1.4) : Math.min(vw / 1440, vh / 960);
      scene.style.setProperty("--u", `${u}px`);
      scene.classList.toggle("is-phone", phone);
      let w: number, h: number, left: number, top: number;
      if (phone) {
        w = vw * 1.55;
        h = (w * 9) / 16;
        left = vw / 2 - 0.4 * w;
        top = 0.36 * vh - 0.448 * h;
      } else {
        const s = Math.max(vw / 1920, vh / 1080);
        w = 1920 * s;
        h = 1080 * s;
        left = (vw - w) / 2;
        top = (vh - h) / 2;
      }
      Object.assign(video.style, {
        width: `${w}px`,
        height: `${h}px`,
        left: `${left}px`,
        top: `${top}px`,
      });
      scene.style.setProperty("--edge-px", `${top + 0.448 * h}px`);
      scene.style.setProperty("--split-px", `${top + 0.6 * h}px`);
      stripW = strip.scrollWidth;
      lettersW = letters.scrollWidth;
      B = ((stripW + 0.45 * vw) / vw) * 1.1;
      track.style.height = `${(1 + A + B) * vh}px`;
    };

    let staticLayout = false;
    const requestTick = () => {
      if (!raf && !staticLayout) raf = requestAnimationFrame(tick);
    };
    const onSeeked = () => {
      seeking = false;
      requestTick();
    };
    const onVideoError = () => {
      staticLayout = true;
      cancelAnimationFrame(raf);
      track.classList.add("is-static");
    };
    const mediaRequest = new AbortController();
    let mediaUrl = "";
    const loadVideo = async () => {
      try {
        const source = window.innerWidth <= 900 ? SRC_SD : SRC_HD;
        const response = await fetch(source, { signal: mediaRequest.signal });
        if (!response.ok) throw new Error(`Freight video returned ${response.status}`);
        const clip = await response.blob();
        if (mediaRequest.signal.aborted) return;
        // The local static server does not support HTTP byte ranges for video seeking.
        mediaUrl = URL.createObjectURL(clip);
        video.src = mediaUrl;
      } catch {
        if (!mediaRequest.signal.aborted) onVideoError();
      }
    };

    const tick = (t: number) => {
      raf = 0;
      const bounds = track.getBoundingClientRect();
      const y = Math.max(0, -bounds.top);
      const visible = bounds.top < vh && bounds.bottom > 0;
      const dt = Math.max(1, t - lastT);
      const inst = Math.min(99, ((Math.abs(window.scrollY - lastY) / dt) * 1000) / 32);
      spd += (inst - spd) * 0.15;
      lastY = window.scrollY;
      lastT = t;

      const q = clamp(y / (A * vh));
      const dur = Number.isFinite(video.duration) ? video.duration : 4.04;
      const target = q * (dur - 1 / 48);
      cur += (target - cur) * 0.2;
      if (!seeking && video.readyState >= 1 && Math.abs(video.currentTime - cur) > 1 / 60) {
        seeking = true;
        video.currentTime = cur;
      }
      scene.style.setProperty("--ph", q >= 0.94 ? "1" : "0");
      speed.textContent = String(Math.round(spd)).padStart(2, "0");

      const r = clamp((y - A * vh) / (B * vh));
      strip.style.transform = `translate3d(${vw - r * (stripW + 0.45 * vw)}px,0,0)`;
      letters.style.transform = `translate3d(${vw - r * (lettersW + vw)}px,0,0)`;
      for (const c of cardEls) {
        const s = clamp((0.98 - c.getBoundingClientRect().left / vw) / 0.3, -0.4, 1.6) * 100;
        c.style.setProperty("--s", `${s}%`);
      }
      if (
        visible &&
        (spd > 0.5 || (!seeking && video.readyState >= 1 && Math.abs(target - cur) > 1 / 60))
      )
        requestTick();
    };

    const resize = () => {
      if (staticLayout) return;
      layout();
      requestTick();
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadedmetadata", requestTick);
    video.addEventListener("error", onVideoError);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", requestTick, { passive: true });
    document.fonts?.ready.then(resize);
    resize();
    void loadVideo();
    return () => {
      cancelAnimationFrame(raf);
      staticLayout = true;
      mediaRequest.abort();
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", requestTick);
      video.removeEventListener("loadedmetadata", requestTick);
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("seeked", onSeeked);
    };
  }, []);

  return (
    <div ref={trackRef} className="fh-track" aria-label="Giới thiệu DCS">
      <div ref={sceneRef} className="fh-scene">
        <video
          ref={videoRef}
          className="fh-video"
          muted
          playsInline
          preload="auto"
          poster={POSTER}
          aria-hidden="true"
        />
        <div ref={lettersRef} className="fh-letters" aria-hidden="true">
          DOUBLE CHECK
        </div>
        <div className="fh-speed" aria-hidden="true">
          <span ref={speedRef}>00</span> KM/H
        </div>
        <div className="fh-band">
          <div ref={stripRef} className="fh-strip">
            <div className="fh-lead">
              <h2 className="fh-headline">
                MỌI CHỨNG TỪ
                <br />
                XUẤT NHẬP KHẨU.
                <br />
                <span>MỘT LẦN KIỂM TRA.</span>
              </h2>
              <div className="fh-paras">
                <p>
                  Từ Commercial Invoice đến Bill of Lading, DCS đọc và đối chiếu từng trường trước
                  khi hàng lên tàu.
                </p>
                <p>
                  Một bộ hồ sơ, một lần tải lên, một bảng kết quả rõ ràng cho nhân viên chứng từ.
                </p>
              </div>
            </div>
            {cards.map(({ Icon, title, body }) => (
              <article key={title.join(" ")} className="fh-card">
                <Icon className="fh-icon" strokeWidth={1.25} aria-hidden="true" />
                <h3 className="fh-text fh-title">
                  {title[0]}
                  <br />
                  {title[1]}
                </h3>
                <p className="fh-text fh-body">{body}</p>
              </article>
            ))}
          </div>
          <a className="fh-pill" href="#input">
            Bắt đầu kiểm tra ↓
          </a>
        </div>
      </div>
    </div>
  );
}

export function mountSiteUi() {
  const hero = document.getElementById("freightHero");
  if (hero) createRoot(hero).render(<FreightHero />);

  if (
    !("IntersectionObserver" in window) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const targets = document.querySelectorAll<HTMLElement>(
    ".stat, .scope-line, .section-head, .upload-shell, .panel, .form-head, .result-sidebar, .method-table-wrap, .method-card, .method-bottom",
  );
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12 },
  );
  targets.forEach((target, index) => {
    target.classList.add("reveal");
    target.style.transitionDelay = `${(index % 4) * 70}ms`;
    observer.observe(target);
  });
}
