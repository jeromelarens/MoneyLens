import React, { useState } from 'react';

interface CapabilityItem {
  id: string;
  category: string;
  headline: string;
  description: string;
  points: string[];
  imageUrl: string;
  imageAlt: string;
  badgeLabel: string;
}

const capabilities: CapabilityItem[] = [
  {
    id: 'clarity',
    category: 'Ledger Normalization',
    headline: 'Financial clarity beyond the ledger.',
    description:
      'Standardize disparate statement exports from retail bank accounts into an immutable, integer minor-unit ledger. Eliminate rounding errors and reconcile multi-account inflows and outflows with precision.',
    points: [
      'Integer minor-unit arithmetic prevents floating-point drift across calculations.',
      'Cryptographic content hashing prevents duplicate statement line ingestion.',
      'Normalized merchant and reference descriptions across multiple accounts.',
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Business desk with financial statement paperwork, calculator, notebook, and laptop',
    badgeLabel: 'Zero Drift Arithmetic',
  },
  {
    id: 'reconciliation',
    category: 'Evidence Verification',
    headline: 'Know which transactions need a closer look.',
    description:
      'Review deterministic matching proposals paired with audit-grade evidence. MoneyLens scores confidence objectively and leaves final confirmation in your hands, ensuring complete books without automated guesswork.',
    points: [
      'Multi-factor matching across timestamps, minor-unit amounts, and descriptions.',
      'Transparent match confidence scoring so you know exactly why pairs match.',
      'Immutable audit trail recording every confirmation, adjustment, and dismissal.',
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1554224154-26032ffc0d07?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Detailed financial ledger documents being audited and reconciled',
    badgeLabel: 'Confidence Scoring',
  },
  {
    id: 'findings',
    category: 'Heuristic Detection',
    headline: 'Spot patterns worth investigating.',
    description:
      'Automated rules detect potential financial leakage such as duplicate debits, recurring price increases, and dormant fees. Findings are clearly marked as investigative items requiring review, not speculative accusations.',
    points: [
      'Configurable detection rules tuned specifically for retail operating expenses.',
      'Full transactional evidence linked to every flagged finding.',
      'Structured lifecycle workflow to review, resolve, or dismiss with recorded reasons.',
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
    imageAlt:
      'High-end financial intelligence display analyzing transaction patterns and variance metrics',
    badgeLabel: 'Leakage Heuristics',
  },
  {
    id: 'planning',
    category: 'Scenario Forecasting',
    headline: 'Plan for what comes next.',
    description:
      'Simulate 30, 60, or 90-day cash projections using moving-average baseline models. Stress-test hypothetical delays in receivables or unexpected equipment purchases while maintaining strict separation from verified history.',
    points: [
      'Moving-average projections reflect verified historical operating patterns.',
      'Interactive scenario simulation for one-time capital costs and payment delays.',
      'Clear visual distinction between settled historical transactions and estimates.',
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Cash-flow planning notebook with currency calculations and business projections',
    badgeLabel: 'Scenario Simulator',
  },
  {
    id: 'actions',
    category: 'Decision Intelligence',
    headline: 'Turn insight into your next decision.',
    description:
      'The Business Action Center connects findings and cash forecasts into prioritized, actionable recommendations. Small retail operators can quickly decide which supplier contracts to dispute or which accounts need immediate balance.',
    points: [
      'Priority ranking based on verified financial exposure and deadline urgency.',
      'Direct links to underlying invoices, ledger transactions, and findings.',
      'Lifecycle tracking from proposed to in-progress and verified resolution.',
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80',
    imageAlt: 'Independent retail storefront owner reviewing operational priorities',
    badgeLabel: 'Action Center',
  },
];

export const LandingCapabilities: React.FC = () => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const handleImageError = (id: string) => {
    setFailedImages((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <section
      id="capabilities"
      className="scroll-mt-24 py-16 sm:py-28 md:py-36 border-t border-ml-border-light max-w-6xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      {/* Editorial Header */}
      <div className="max-w-2xl mb-16 sm:mb-24">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-ml-border-light shadow-2xs mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">
            Platform Capabilities
          </span>
        </div>
        <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-ml-black leading-tight tracking-tight">
          Built for clarity at every stage of cash movement.
        </h2>
        <p className="font-sans text-base sm:text-lg text-ml-text-secondary leading-relaxed mt-4 font-normal">
          From multi-account statement normalization to proactive retail decision support, explore
          how MoneyLens safeguards business capital.
        </p>
      </div>

      {/* Varied Alternating Editorial Blocks */}
      <div className="space-y-20 sm:space-y-28 md:space-y-36">
        {capabilities.map((item, idx) => {
          const isEven = idx % 2 === 1;

          return (
            <div
              key={item.id}
              className={`grid grid-cols-1 lg:grid-cols-12 gap-10 sm:gap-14 lg:gap-16 items-center ${
                isEven ? 'lg:grid-flow-dense' : ''
              }`}
            >
              {/* Copy Column */}
              <div className={`lg:col-span-6 ${isEven ? 'lg:col-start-7' : ''}`}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-stone-200/80 shadow-2xs mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
                  <span className="text-xs font-semibold text-stone-800 tracking-wide">
                    {item.category}
                  </span>
                </div>

                <h3 className="font-serif text-2xl sm:text-3xl md:text-4xl font-normal text-ml-black leading-snug tracking-tight">
                  {item.headline}
                </h3>
                <p className="font-sans text-base sm:text-lg text-ml-text-secondary leading-relaxed mt-4 font-normal">
                  {item.description}
                </p>

                {/* Substantive Invariant Points */}
                <ul className="mt-6 space-y-3">
                  {item.points.map((point, pIdx) => (
                    <li key={pIdx} className="flex items-start gap-3 text-sm text-ml-text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard mt-2 shrink-0" />
                      <span className="leading-relaxed font-normal">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Photography Column */}
              <div className={`lg:col-span-6 ${isEven ? 'lg:col-start-1' : ''}`}>
                <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-stone-200/90 bg-stone-100 shadow-xl shadow-stone-900/[0.04]">
                  {failedImages[item.id] ? (
                    <div className="aspect-[4/3] sm:aspect-[16/10] flex items-center justify-center p-8 bg-stone-100 text-stone-500">
                      <div className="text-center">
                        <span className="w-2 h-2 rounded-full bg-ml-mustard inline-block mb-2" />
                        <p className="text-sm font-medium text-ml-black">{item.headline}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <img
                        src={item.imageUrl}
                        alt={item.imageAlt}
                        className="w-full aspect-[4/3] sm:aspect-[16/10] object-cover object-center"
                        loading="lazy"
                        onError={() => handleImageError(item.id)}
                      />
                      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full border border-stone-200/80 text-[11px] font-medium text-stone-700 shadow-sm">
                        {item.badgeLabel}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
