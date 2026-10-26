import React from 'react';

const steps = [
  {
    step: '01',
    title: 'Bring in your financial data.',
    description:
      'Upload CSV or XLSX bank statements and payment processor records. MoneyLens normalizes merchant descriptions, prevents duplicate lines, and organizes minor units with cryptographic integrity.',
  },
  {
    step: '02',
    title: 'Review evidence-backed insights.',
    description:
      'Evaluate deterministic transaction match proposals with confidence scoring. Investigate detected findings—from potential duplicate debits to unnoticed supplier rate creep.',
  },
  {
    step: '03',
    title: 'Prioritize your next actions.',
    description:
      'Simulate future cash scenarios with moving-average models, stress-test capital expenses, and resolve prioritized business actions backed by linked evidence.',
  },
];

export const LandingHowItWorks: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 py-16 sm:py-28 md:py-36 border-t border-ml-border-light"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-2xl mb-14 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-ml-border-light shadow-2xs mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">
              The Workflow
            </span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-ml-black leading-tight tracking-tight">
            How MoneyLens works.
          </h2>
          <p className="font-sans text-base sm:text-lg text-ml-text-secondary leading-relaxed mt-4 font-normal">
            A straightforward three-step process from raw statement files to confident retail
            business decisions.
          </p>
        </div>

        {/* Minimal Horizontal Step Layout (Typography & Whitespace Discipline) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 sm:gap-12 lg:gap-14">
          {steps.map((item) => (
            <div key={item.step} className="flex flex-col">
              <div className="flex items-center gap-3">
                <span className="font-serif text-2xl sm:text-3xl font-normal text-ml-mustard tracking-tight">
                  {item.step}
                </span>
                <span className="h-[1px] flex-1 bg-ml-border-light" />
              </div>
              <h3 className="font-serif text-xl sm:text-2xl font-normal text-ml-black mt-4 leading-snug tracking-tight">
                {item.title}
              </h3>
              <p className="font-sans text-sm sm:text-base text-ml-text-secondary leading-relaxed mt-3 font-normal">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
