import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LandingProductStory: React.FC = () => {
  const [imageError, setImageError] = useState(false);

  return (
    <section
      id="product"
      className="scroll-mt-24 py-16 sm:py-28 md:py-36 border-t border-ml-border-light"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Asymmetric Left Narrative Column (7 cols) */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-ml-border-light shadow-2xs mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                The Product Narrative
              </span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-ml-black leading-tight tracking-tight">
              See the story behind your numbers.
            </h2>

            <p className="font-sans text-base sm:text-lg text-ml-text-secondary leading-relaxed mt-5 font-normal">
              Most retail bookkeeping tools show past transactions, but leave owners guessing about
              where cash will be next month. MoneyLens connects normalized statement records,
              evidence-backed reconciliations, detected margin leakage, and scenario planning into
              one coherent view.
            </p>

            {/* Restrained Four-Pillar Flow */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 pt-8 border-t border-ml-border-light">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-ml-black">
                  <Check className="w-4 h-4 text-ml-mustard stroke-[2.5]" />
                  <span>Normalized Statement Ledger</span>
                </div>
                <p className="text-xs text-ml-text-secondary leading-relaxed pl-6">
                  Clean merchant records with integer minor-unit math and zero rounding drift.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-ml-black">
                  <Check className="w-4 h-4 text-ml-mustard stroke-[2.5]" />
                  <span>Evidence-Backed Reconciliation</span>
                </div>
                <p className="text-xs text-ml-text-secondary leading-relaxed pl-6">
                  Transparent confidence scores matching bank inflows with invoice receipts.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-ml-black">
                  <Check className="w-4 h-4 text-ml-mustard stroke-[2.5]" />
                  <span>Proactive Leakage Detection</span>
                </div>
                <p className="text-xs text-ml-text-secondary leading-relaxed pl-6">
                  Heuristic rules identify duplicate supplier debits and unnoticed rate creep.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-ml-black">
                  <Check className="w-4 h-4 text-ml-mustard stroke-[2.5]" />
                  <span>Actionable Forward Forecasts</span>
                </div>
                <p className="text-xs text-ml-text-secondary leading-relaxed pl-6">
                  30 to 90-day moving projections strictly segregated from historical balances.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 text-sm font-semibold text-ml-black hover:text-stone-700 transition-colors group"
              >
                <span>Explore the interactive workspace</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* Asymmetric Right Imagery Column (5 cols) */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-ml-border-light bg-stone-100 shadow-xl shadow-stone-900/[0.04]">
              {imageError ? (
                <div className="aspect-[4/5] flex items-center justify-center p-8 bg-stone-100 text-stone-500">
                  <span className="w-2 h-2 rounded-full bg-ml-mustard" />
                </div>
              ) : (
                <img
                  src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=80"
                  alt="Modern independent retail shop merchandise with clean natural lighting"
                  className="w-full aspect-[4/5] object-cover object-center"
                  loading="lazy"
                  onError={() => setImageError(true)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
