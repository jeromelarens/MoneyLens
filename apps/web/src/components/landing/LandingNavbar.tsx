import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';

export const LandingNavbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Scrolled past top threshold adds backdrop blur and border
      setScrolled(currentScrollY > 15);

      // Scroll direction detection:
      // If at or near top (<= 25px), always show navbar
      if (currentScrollY <= 25) {
        setVisible(true);
      } else if (currentScrollY > lastScrollY.current && currentScrollY - lastScrollY.current > 5) {
        // Scrolling DOWN -> Hide navbar
        setVisible(false);
      } else if (currentScrollY < lastScrollY.current && lastScrollY.current - currentScrollY > 5) {
        // Scrolling UP -> Reveal navbar
        setVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [mobileMenuOpen]);

  // Ensure navbar remains visible when mobile drawer is open
  const isNavbarVisible = visible || mobileMenuOpen;

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${
          isNavbarVisible
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0 pointer-events-none'
        } ${
          scrolled
            ? 'bg-ml-warm-white/95 backdrop-blur-md border-b border-ml-border-light shadow-2xs'
            : 'bg-ml-warm-white/90 backdrop-blur-xs border-b border-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Brand Logo & Editorial Wordmark */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded-lg py-1"
            aria-label="MoneyLens Home"
          >
            <div className="w-8 h-8 rounded-lg bg-ml-black flex items-center justify-center transition-transform duration-200 group-hover:scale-105 shadow-sm">
              <div className="relative w-4 h-4 flex items-center justify-center">
                <span className="absolute w-3.5 h-3.5 rounded-full border-[1.5px] border-white/90" />
                <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
              </div>
            </div>
            <span className="font-sans font-bold text-xl tracking-tight text-ml-black">
              MoneyLens
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav
            className="hidden md:flex items-center gap-8 text-sm font-medium text-ml-text-secondary"
            aria-label="Main Navigation"
          >
            <a
              href="#product"
              className="hover:text-ml-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded py-1 px-1.5"
            >
              Product
            </a>
            <a
              href="#capabilities"
              className="hover:text-ml-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded py-1 px-1.5"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              className="hover:text-ml-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded py-1 px-1.5"
            >
              How it works
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-5">
            <Link
              to="/signin"
              className="text-sm font-medium text-ml-text-secondary hover:text-ml-black transition-colors py-2 px-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard"
            >
              Sign in
            </Link>
            <Link
              to="/app"
              className="inline-flex items-center gap-1.5 bg-ml-mustard hover:bg-ml-mustard-hover text-ml-black font-semibold text-sm px-5 py-2.5 rounded-full transition-all duration-150 shadow-sm active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-black focus-visible:ring-offset-2"
            >
              <span>Get started</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.2]" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="w-10 h-10 rounded-xl border border-ml-border-light bg-white text-ml-text-primary hover:bg-ml-border-light/60 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard active:scale-95"
              aria-expanded={mobileMenuOpen}
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Full-Screen Navigation Drawer via Portal */}
      {mobileMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
            className="fixed inset-0 z-[100] bg-[#F8F7F2] md:hidden flex flex-col justify-between"
          >
            {/* Overlay Top Bar */}
            <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-ml-border-light bg-[#F8F7F2] shrink-0">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 group py-1"
                aria-label="MoneyLens Home"
              >
                <div className="w-8 h-8 rounded-lg bg-ml-black flex items-center justify-center shadow-sm">
                  <div className="relative w-4 h-4 flex items-center justify-center">
                    <span className="absolute w-3.5 h-3.5 rounded-full border-[1.5px] border-white/90" />
                    <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
                  </div>
                </div>
                <span className="font-sans font-bold text-xl tracking-tight text-ml-black">
                  MoneyLens
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 rounded-xl border border-ml-border-light bg-white text-ml-text-primary hover:bg-stone-100 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard active:scale-95"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu Links */}
            <div className="flex-1 px-6 py-8 flex flex-col justify-between overflow-y-auto">
              <nav className="flex flex-col space-y-2 text-ml-text-primary">
                <a
                  href="#product"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-3 px-4 rounded-2xl hover:bg-white text-ml-black font-serif text-2xl border border-transparent hover:border-ml-border-light transition-all flex items-center justify-between min-h-[48px]"
                >
                  <span>Product</span>
                  <ArrowRight className="w-4 h-4 text-ml-text-secondary" />
                </a>
                <a
                  href="#capabilities"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-3 px-4 rounded-2xl hover:bg-white text-ml-black font-serif text-2xl border border-transparent hover:border-ml-border-light transition-all flex items-center justify-between min-h-[48px]"
                >
                  <span>Capabilities</span>
                  <ArrowRight className="w-4 h-4 text-ml-text-secondary" />
                </a>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-3 px-4 rounded-2xl hover:bg-white text-ml-black font-serif text-2xl border border-transparent hover:border-ml-border-light transition-all flex items-center justify-between min-h-[48px]"
                >
                  <span>How it works</span>
                  <ArrowRight className="w-4 h-4 text-ml-text-secondary" />
                </a>
              </nav>

              {/* Bottom Action CTAs */}
              <div className="pt-6 border-t border-ml-border-light flex flex-col gap-3">
                <Link
                  to="/signin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full min-h-[48px] flex items-center justify-center py-3 font-semibold text-sm text-ml-text-primary border border-ml-border-light rounded-2xl bg-white hover:bg-stone-50 transition-colors shadow-2xs"
                >
                  Sign in to workspace
                </Link>
                <Link
                  to="/app"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 py-3 font-bold text-sm bg-ml-mustard hover:bg-ml-mustard-hover text-ml-black rounded-2xl shadow-sm transition-colors active:scale-98"
                >
                  <span>Get started</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.2]" />
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
