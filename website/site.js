document.addEventListener("DOMContentLoaded", () => {
  // ── Scroll-driven expanding navbar background ──
  const animatedHeader = document.querySelector("header");
  const animatedCapsule = animatedHeader?.querySelector(".nav-capsule");
  
  if (animatedHeader && animatedCapsule) {
      animatedHeader.querySelector(".nav-expanding-bg")?.remove();
  
      const expandingBg = document.createElement("div");
      expandingBg.className = "nav-expanding-bg";
      expandingBg.setAttribute("aria-hidden", "true");
      animatedHeader.prepend(expandingBg);
  
      const expansionDistance = 180;
      const motionPreference = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
      );
  
      let geometry = null;
      let animationFrame = null;
  
      function measureNavbar() {
          const headerBounds = animatedHeader.getBoundingClientRect();
          const capsuleBounds = animatedCapsule.getBoundingClientRect();
  
          geometry = {
              x: capsuleBounds.left - headerBounds.left,
              y: capsuleBounds.top - headerBounds.top,
              width: capsuleBounds.width,
              height: capsuleBounds.height,
              fullWidth: headerBounds.width,
              fullHeight: headerBounds.height,
              visible:
                  animatedCapsule.getClientRects().length > 0 &&
                  capsuleBounds.width > 0
          };
      }
  
      function drawNavbar() {
          animationFrame = null;
  
          if (!geometry) measureNavbar();
  
          const scrollPosition = Math.max(0, window.scrollY);
          let progress = Math.min(
              scrollPosition / expansionDistance,
              1
          );
  
          if (motionPreference.matches) {
              progress = scrollPosition > 0 ? 1 : 0;
          }
  
          const g = geometry;
          const interpolate = (from, to) =>
              from + (to - from) * progress;
  
          // Mobile: show a full background after scrolling.
          if (!g.visible) {
              Object.assign(expandingBg.style, {
                  left: "0px",
                  top: "0px",
                  width: `${g.fullWidth}px`,
                  height: `${g.fullHeight}px`,
                  borderRadius: "0px",
                  opacity: String(progress)
              });
          } else {
              Object.assign(expandingBg.style, {
                  left: `${interpolate(g.x, 0)}px`,
                  top: `${interpolate(g.y, 0)}px`,
                  width: `${interpolate(g.width, g.fullWidth)}px`,
                  height: `${interpolate(g.height, g.fullHeight)}px`,
                  borderRadius: `${interpolate(g.height / 2, 0)}px`,
                  opacity: "1"
              });
          }
  
          expandingBg.style.boxShadow = `
              0 ${2 + progress * 6}px
              ${12 + progress * 12}px
              rgba(12, 29, 20, ${0.04 + progress * 0.04})
          `;
      }
  
      function queueNavbarDraw() {
          if (animationFrame === null) {
              animationFrame = requestAnimationFrame(drawNavbar);
          }
      }
  
      function refreshNavbar() {
          measureNavbar();
          queueNavbarDraw();
      }
  
      window.addEventListener("scroll", queueNavbarDraw, {
          passive: true
      });
  
      window.addEventListener("resize", refreshNavbar);
      window.addEventListener("pageshow", refreshNavbar);
      motionPreference.addEventListener("change", queueNavbarDraw);
  
      const navbarResizeObserver = new ResizeObserver(refreshNavbar);
      navbarResizeObserver.observe(animatedHeader);
      navbarResizeObserver.observe(animatedCapsule);
  
      if (document.fonts) {
          document.fonts.ready.then(refreshNavbar);
      }
  
      measureNavbar();
      drawNavbar();
  }
    if (window.ENV) {
        const apkLink = window.ENV.APK_LINK;
        const macLink = window.ENV.MAC_LINK;

        if (apkLink) {
            const downloadLinks = document.querySelectorAll('#download-link, #cta-download-link');
            downloadLinks.forEach(el => el.href = apkLink);
        }
        if (macLink) {
            const macDownloadLinks = document.querySelectorAll('#mac-download-link, #cta-mac-download-link');
            macDownloadLinks.forEach(el => el.href = macLink);
        }

        if (apkLink) {
            const versionMatch = apkLink.match(/(v\d+\.\d+\.\d+)/);
            if (versionMatch && versionMatch[1]) {
                const versionEl = document.getElementById('version-text');
                if (versionEl) versionEl.innerText = versionMatch[1];
                const mobileVersionEl = document.getElementById('mobile-version-text');
                if (mobileVersionEl) mobileVersionEl.innerText = versionMatch[1];
            }
        }
    }

    // ── Navigation Interactivity & Active State Toggling ──
    const navItems = document.querySelectorAll('.nav-capsule .nav-item');
    const internalNavLinks = Array.from(navItems).filter(item => {
        const href = item.getAttribute('href');
        return href && (href.startsWith('#') || href === '#');
    });

    let isProgrammaticScroll = false;
    let scrollTimer = null;

    function setActiveNav(targetHref) {
        internalNavLinks.forEach(item => {
            const href = item.getAttribute('href');
            const isMatch = href === targetHref ||
                (targetHref === '#home' && (href === '#' || href === '#home')) ||
                (targetHref === '#' && (href === '#' || href === '#home'));

            if (isMatch) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Also sync mobile menu links
        document.querySelectorAll('.mobile-nav-item').forEach(mItem => {
            const href = mItem.getAttribute('href');
            const isMatch = href === targetHref ||
                (targetHref === '#home' && (href === '#' || href === '#home')) ||
                (targetHref === '#' && (href === '#' || href === '#home'));
            if (isMatch) {
                mItem.classList.add('active');
            } else if (!mItem.getAttribute('target')) {
                mItem.classList.remove('active');
            }
        });
    }

    internalNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            e.preventDefault();

            // Immediately change active color on click
            setActiveNav(href);

            isProgrammaticScroll = true;
            clearTimeout(scrollTimer);

            if (href === '#' || href === '#home') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (history.pushState) history.pushState(null, null, ' ');
            } else {
                const targetSection = document.querySelector(href);
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth' });
                    if (history.pushState) history.pushState(null, null, href);
                }
            }

            scrollTimer = setTimeout(() => {
                isProgrammaticScroll = false;
            }, 800);
        });
    });

    // ── Mobile Menu Drawer Handlers ──
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileMenuClose = document.getElementById('mobile-menu-close');
    const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
    const mobileMenuDrawer = document.getElementById('mobile-menu-drawer');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-item, .mobile-cta-btn');

    function openMobileMenu() {
        if (mobileMenuDrawer && mobileMenuOverlay) {
            mobileMenuDrawer.classList.add('active');
            mobileMenuDrawer.setAttribute('aria-hidden', 'false');
            mobileMenuOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeMobileMenu() {
        if (mobileMenuDrawer && mobileMenuOverlay) {
            mobileMenuDrawer.classList.remove('active');
            mobileMenuDrawer.setAttribute('aria-hidden', 'true');
            mobileMenuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', openMobileMenu);
    }

    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }

    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', closeMobileMenu);
    }

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && (href.startsWith('#') || href === '#')) {
                e.preventDefault();
                closeMobileMenu();

                setActiveNav(href);

                setTimeout(() => {
                    if (href === '#' || href === '#home') {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                        const target = document.querySelector(href);
                        if (target) target.scrollIntoView({ behavior: 'smooth' });
                    }
                }, 220);
            }
        });
    });

    // Sync mobile version text
    if (window.ENV && window.ENV.APK_LINK) {
        const mobileVersionEl = document.getElementById('mobile-version-text');
        const vm = window.ENV.APK_LINK.match(/(v\d+\.\d+\.\d+)/);
        if (mobileVersionEl && vm && vm[1]) {
            mobileVersionEl.innerText = vm[1];
        }
    }

    // Brand Logo click -> smooth scroll to top & activate Home
    const brandLogo = document.querySelector('.brand');
    if (brandLogo) {
        brandLogo.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav('#home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (history.pushState) history.pushState(null, null, ' ');
        });
    }

    // Hero scroll prompt ("SCROLL ↓") -> activate About and smooth scroll
    const scrollPrompt = document.querySelector('.hero-scroll-prompt');
    if (scrollPrompt) {
        scrollPrompt.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav('#about');
            const aboutSec = document.getElementById('about');
            if (aboutSec) aboutSec.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Scroll Spy to keep active nav button in sync during manual scroll
    const sections = [
        { id: 'home', href: '#home' },
        { id: 'about', href: '#about' },
        { id: 'features', href: '#features' },
      { id: 'how-it-works', href: '#how-it-works' },
        { id: 'protocols', href: '#protocols' }
    ];

    window.addEventListener('scroll', () => {
        if (isProgrammaticScroll) return;

        const threshold = 160;
        let activeSectionHref = '#home';

        if ((window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 80)) {
            activeSectionHref = sections[sections.length - 1].href;
        } else {
            for (const sec of sections) {
                const el = document.getElementById(sec.id);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top <= threshold) {
                        activeSectionHref = sec.href;
                    }
                }
            }
        }

        setActiveNav(activeSectionHref);
    }, { passive: true });
});
