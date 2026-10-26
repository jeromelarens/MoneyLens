import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export const LandingFinalCTA: React.FC = () => {
  return (
    <section className="bg-ml-warm-white py-16 sm:py-24 md:py-36 border-t border-ml-border-light">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-2xl sm:rounded-3xl bg-white border border-ml-border-light p-6 sm:p-12 md:p-20 text-center shadow-xl shadow-stone-900/[0.03] overflow-hidden">
          {/* Subtle warm ambient glow accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-ml-mustard/15 rounded-full blur-3xl pointer-events-none" />

          {/* Editorial Eyebrow */}
          <div className="relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-ml-warm-white border border-ml-border-light shadow-2xs text-xs font-semibold text-stone-700 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
            <span>Independent Retail Decision Intelligence</span>
          </div>

          {/* Heading in DM Serif Display */}
          <h2 className="relative font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight text-ml-black leading-tight max-w-3xl mx-auto">
            Make your next business decision with clarity.
          </h2>

          {/* Supporting Copy in Manrope */}
          <p className="relative font-sans text-base sm:text-lg text-ml-text-secondary max-w-xl mx-auto leading-relaxed mt-5 font-normal">
            Understand your financial activity and move forward with a clearer picture.
          </p>

          {/* Action Buttons */}
          <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 sm:mt-10">
            <Link
              to="/app"
              className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 bg-ml-mustard hover:bg-ml-mustard-hover text-ml-black font-semibold text-base px-8 py-3 rounded-full shadow-sm hover:shadow-md transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-black focus-visible:ring-offset-2"
            >
              <span>Get started</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2]" />
            </Link>
            <Link
              to="/signin"
              className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-ml-text-primary border border-ml-border-light hover:border-ml-black font-medium text-base px-7 py-3 rounded-full shadow-2xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard"
            >
              <span>Sign in to workspace</span>
            </Link>
          </div>

          {/* Trust Guarantees */}
          <div className="relative flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-ml-text-secondary mt-8 pt-6 border-t border-stone-100 max-w-md mx-auto">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Multi-tenant isolation</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Zero formula drift</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
