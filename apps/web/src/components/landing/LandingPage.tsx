import React, { useEffect } from 'react';
import { LandingNavbar } from './LandingNavbar';
import { LandingHero } from './LandingHero';
import { LandingProductStory } from './LandingProductStory';
import { LandingCapabilities } from './LandingCapabilities';
import { LandingHowItWorks } from './LandingHowItWorks';
import { LandingFinalCTA } from './LandingFinalCTA';
import { LandingFooter } from './LandingFooter';

export const LandingPage: React.FC = () => {
  // Update page title for editorial brand landing page
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'MoneyLens — Know where your money goes. Decide what comes next.';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-ml-warm-white text-ml-text-primary font-sans antialiased selection:bg-ml-mustard selection:text-ml-black flex flex-col scroll-smooth">
      {/* 1. Header Navigation */}
      <LandingNavbar />

      {/* 2. Main Content Landmarks */}
      <main className="flex-1">
        {/* A. Editorial Hero Section */}
        <LandingHero />

        {/* B. Asymmetric Product Story Narrative */}
        <LandingProductStory />

        {/* C. Platform Core Capabilities (Alternating Editorial Blocks) */}
        <LandingCapabilities />

        {/* D. Three-Step How It Works Workflow */}
        <LandingHowItWorks />

        {/* E. High-Impact Final CTA */}
        <LandingFinalCTA />
      </main>

      {/* 3. Quiet, Professional Public Footer */}
      <LandingFooter />
    </div>
  );
};
