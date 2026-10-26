import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';

export const LandingHero: React.FC = () => {
  const [imageError, setImageError] = useState(false);

  return (
    <section className="relative pt-24 sm:pt-32 md:pt-40 pb-12 sm:pb-20 md:pb-24 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Editorial Headline Lockup */}
        <div className="text-center max-w-4xl mx-auto">
          {/* Editorial Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-ml-border-light shadow-2xs mb-5 sm:mb-6 text-xs font-medium text-ml-text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
            <span>Financial Intelligence for Independent Retail</span>
          </div>

          {/* Editorial Display Headline in DM Serif Display */}
          <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl lg:text-[76px] font-normal text-ml-black leading-[1.12] sm:leading-[1.08] tracking-tight">
            Know where your money goes.
            <span className="block mt-2 sm:mt-3 font-serif italic text-stone-800 font-normal">
              Decide what comes next<span className="text-ml-mustard not-italic">.</span>
            </span>
          </h1>

          {/* Supporting Copy in Manrope */}
          <p className="font-sans text-sm sm:text-lg md:text-xl text-ml-text-secondary max-w-2xl mx-auto leading-relaxed mt-4 sm:mt-8 font-normal px-1">
            Understand where money moves, uncover unusual patterns, and make your next business
            decision with greater clarity.
          </p>

          {/* Two Rounded Pill Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-6 sm:mt-10">
            <Link
              to="/app"
              className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 bg-ml-mustard hover:bg-ml-mustard-hover text-ml-black font-semibold text-base px-8 py-3 rounded-full shadow-sm hover:shadow-md transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-black focus-visible:ring-offset-2"
            >
              <span>Get started</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2]" />
            </Link>
            <a
              href="#capabilities"
              className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-ml-text-primary border border-ml-border-light hover:border-ml-black font-medium text-base px-8 py-3 rounded-full shadow-2xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard"
            >
              <span>Explore features</span>
            </a>
          </div>

          {/* Confidence Highlights */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-xs sm:text-sm text-ml-text-secondary mt-8">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Zero manual formulas</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Multi-account ledger</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Cryptographic duplicate prevention</span>
            </span>
          </div>
        </div>

        {/* Visual Centerpiece: High-Resolution Cinematic Retail Showcase */}
        <div className="mt-14 sm:mt-20 relative">
          <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-ml-border-light bg-stone-100 shadow-xl shadow-stone-900/[0.04]">
            {imageError ? (
              <div className="aspect-[16/9] sm:aspect-[21/9] flex items-center justify-center p-8 bg-stone-100 text-stone-500">
                <div className="text-center max-w-md">
                  <span className="w-2.5 h-2.5 rounded-full bg-ml-mustard inline-block mb-3" />
                  <p className="text-sm font-medium text-ml-black">
                    MoneyLens Storefront Intelligence
                  </p>
                  <p className="text-xs text-ml-text-secondary mt-1">
                    Visualizing retail cash flow and decision intelligence.
                  </p>
                </div>
              </div>
            ) : (
              <img
                src="https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=1600&q=80"
                alt="Independent retail business owner reviewing accounts on a laptop in a sunlit boutique workspace"
                className="w-full aspect-[16/9] sm:aspect-[21/9] object-cover object-center"
                loading="lazy"
                onError={() => setImageError(true)}
              />
            )}

            {/* Subtle Frosted Editorial Overlay Card (Bottom-Left) */}
            <div className="hidden md:block absolute bottom-6 left-6 max-w-xs bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-white/80 shadow-lg text-left animate-in fade-in duration-300">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Multi-Account Ingestion</span>
              </div>
              <p className="font-serif text-sm text-ml-black font-normal">
                Normalized ledger with zero floating-point rounding errors.
              </p>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-stone-500 pt-2 border-t border-stone-100">
                <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
                <span>Cryptographic SHA-256 deduplication</span>
              </div>
            </div>

            {/* Subtle Frosted Editorial Overlay Card (Top-Right) */}
            <div className="hidden lg:block absolute top-6 right-6 max-w-xs bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-white/80 shadow-lg text-left animate-in fade-in duration-300">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">
                <Sparkles className="w-3 h-3 text-ml-mustard" />
                <span>Decision Intelligence</span>
              </div>
              <p className="font-serif text-sm text-ml-black font-normal">
                Detect fee creep &amp; simulate 30-day cash flow projections.
              </p>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-stone-500 pt-2 border-t border-stone-100">
                <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
                <span>Built for retail founders</span>
              </div>
            </div>
          </div>

          {/* Minimal Photographic Caption */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-ml-text-secondary font-normal border-t border-ml-border-light pt-3 text-left">
            <span>Independent retail operations &bull; Multi-account statement normalization</span>
            <span className="hidden sm:inline">
              Built for shopkeepers, boutique owners, and retail founders
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
