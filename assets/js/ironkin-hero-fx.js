/* Ironkin hero FX (2026-10-17): drifting embers + dust from the right, and a
   "living" glow that flickers wherever the uploaded hero art is brightest.
   - Glow: a blurred copy of the hero image in a screen blend, its opacity
     driven by a smoothed random walk (firelight, not a strobe). Works for any
     image staff upload because it follows the art's own bright areas.
   - Particles: one canvas, ~70 particles on desktop / ~36 on phones, drawn
     with additive blending. Pauses when the hero is off screen or the tab is
     hidden. Nothing runs for prefers-reduced-motion. */
(function () {
  if (window.__ikHeroFx) return;
  window.__ikHeroFx = true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function init() {
    var hero = document.querySelector('.ik-visual-banner');
    var img = hero && hero.querySelector('img[data-ik-home-image="hero"], img');
    if (!hero || !img) return;

    /* ---------- living glow ---------- */
    var glow = document.createElement('div');
    glow.className = 'ik-hero-glow';
    glow.setAttribute('aria-hidden', 'true');
    img.after(glow);
    function syncGlow() {
      var src = img.currentSrc || img.src;
      if (src) glow.style.backgroundImage = 'url("' + src.replace(/"/g, '%22') + '")';
      glow.classList.toggle('is-ready', !!src && img.complete && img.naturalWidth > 0);
    }
    img.addEventListener('load', syncGlow);
    new MutationObserver(syncGlow).observe(img, { attributes: true, attributeFilter: ['src', 'srcset'] });
    syncGlow();

    /* ---------- particles ---------- */
    var canvas = document.createElement('canvas');
    canvas.className = 'ik-hero-embers';
    canvas.setAttribute('aria-hidden', 'true');
    hero.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, dpr = 1, parts = [], target = 0;

    function size() {
      var r = hero.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      target = W < 700 ? 36 : W < 1200 ? 54 : 72;
    }

    function spawn(anywhere) {
      var ember = Math.random() < 0.64;
      var speed = ember ? 0.35 + Math.random() * 0.9 : 0.12 + Math.random() * 0.35;
      return {
        ember: ember,
        x: anywhere ? Math.random() * W : W + Math.random() * 60,
        // embers rise from the lower two-thirds; dust anywhere
        y: ember ? H * (0.25 + Math.random() * 0.8) : Math.random() * H,
        vx: -speed * (W < 700 ? 0.8 : 1),
        vy: ember ? -(0.08 + Math.random() * 0.32) : (Math.random() - 0.5) * 0.12,
        r: ember ? 0.7 + Math.random() * 1.6 : 0.8 + Math.random() * 2.2,
        hue: 16 + Math.random() * 20,
        a: ember ? 0.55 + Math.random() * 0.45 : 0.05 + Math.random() * 0.1,
        ph: Math.random() * Math.PI * 2,
        fl: 2 + Math.random() * 5,          // flicker speed
        wob: 0.4 + Math.random() * 1.2,     // wobble speed
        life: 0,
        max: 600 + Math.random() * 900
      };
    }

    var running = false, visible = true, last = 0, glowLevel = 0.32, glowVel = 0;
    function frame(t) {
      if (!running) return;
      var dt = Math.min(48, t - (last || t)) / 16.67; last = t;

      // glow: smoothed random walk between ~0.18 and ~0.55, with rare flares
      glowVel += (Math.random() - 0.5) * 0.02 * dt;
      glowVel *= 0.9;
      glowLevel += glowVel * dt + (0.34 - glowLevel) * 0.012 * dt;
      if (Math.random() < 0.004 * dt) glowVel += 0.05;      // occasional flare
      glowLevel = Math.max(0.16, Math.min(0.58, glowLevel));
      glow.style.opacity = glowLevel.toFixed(3);

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      while (parts.length < target) parts.push(spawn(parts.length < target * 0.6 && !last));
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life += dt;
        p.x += p.vx * dt;
        p.y += (p.vy + Math.sin(t * 0.001 * p.wob + p.ph) * (p.ember ? 0.18 : 0.08)) * dt;
        var fadeIn = Math.min(1, p.life / 40), fadeOut = Math.min(1, (p.max - p.life) / 120);
        var leftFade = Math.min(1, p.x / (W * 0.35));          // thin out toward the headline
        var alpha = p.a * fadeIn * Math.max(0, fadeOut) * (0.35 + 0.65 * leftFade);
        if (p.ember) alpha *= 0.65 + 0.35 * Math.sin(t * 0.001 * p.fl + p.ph);
        if (p.x < -20 || p.y < -20 || p.y > H + 20 || p.life > p.max) { parts[i] = spawn(false); continue; }
        if (alpha <= 0.01) continue;
        if (p.ember) {
          ctx.fillStyle = 'hsla(' + p.hue + ',100%,55%,' + (alpha * 0.22).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, 6.283); ctx.fill();
          ctx.fillStyle = 'hsla(' + (p.hue + 12) + ',100%,72%,' + alpha.toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(214,206,196,' + alpha.toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
      }
      requestAnimationFrame(frame);
    }
    function start() { if (running || !visible || document.hidden) return; running = true; last = 0; requestAnimationFrame(frame); }
    function stop() { running = false; }

    size();
    new ResizeObserver(function () { size(); }).observe(hero);
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0 }).observe(hero);
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
