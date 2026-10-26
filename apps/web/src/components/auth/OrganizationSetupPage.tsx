import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Lock,
  CheckCircle2,
  Building2,
  Coins,
  Store,
} from 'lucide-react';
import { healthService } from '../../services/health.service';
import { financialService } from '../../services/financial.service';

export const OrganizationSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/app';

  const [organizationName, setOrganizationName] = useState('');
  const [businessType, setBusinessType] = useState('retail_boutique');
  const [currency, setCurrency] = useState('USD');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field-level error messages
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Update page title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Set Up Business Workspace — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  const validate = (): boolean => {
    let isValid = true;
    setNameError(null);
    setSubmitError(null);

    const trimmedName = organizationName.trim();
    if (!trimmedName) {
      setNameError('Business or organization name is required.');
      isValid = false;
    } else if (trimmedName.length < 2) {
      setNameError('Business name must be at least 2 characters.');
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Verify backend health and account readiness
      await healthService.getHealth();
      await financialService.getAccounts();

      // 2. Persist organization setup metadata in client storage for workspace personalization
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('ml_organization_name', organizationName.trim());
        localStorage.setItem('ml_organization_currency', currency);
        localStorage.setItem('ml_business_type', businessType);
        localStorage.setItem('ml_setup_completed', 'true');
      }

      // 3. Navigate to workspace dashboard
      navigate(redirectPath);
    } catch {
      setSubmitError(
        'Unable to complete business workspace setup. Please verify your connection or try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ml-warm-white text-ml-text-primary font-sans antialiased selection:bg-ml-mustard selection:text-ml-black flex flex-col lg:grid lg:grid-cols-12">
      {/* ============================================================ */}
      {/* LEFT COLUMN: Clean Editorial Setup Container                  */}
      {/* ============================================================ */}
      <div className="lg:col-span-7 xl:col-span-6 flex flex-col justify-between p-4 sm:p-8 md:p-12 min-h-screen">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between">
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

          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-ml-text-secondary hover:text-ml-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded py-1.5 px-2.5 min-h-[36px]"
          >
            <span>Skip to workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Central Setup Form Module */}
        <div className="w-full max-w-md mx-auto my-auto py-6 sm:py-8">
          {/* Progress Indicator */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-6">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>1. Account</span>
            </div>
            <span className="h-[1px] w-3 sm:w-4 bg-stone-300" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ml-black bg-white px-2.5 py-1 rounded-full border border-ml-border-light shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-ml-mustard" />
              <span>2. Business Setup</span>
            </div>
            <span className="h-[1px] w-3 sm:w-4 bg-stone-300" />
            <div className="text-xs font-medium text-stone-400 px-2 py-1">
              <span>3. Workspace</span>
            </div>
          </div>

          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-ml-border-light shadow-2xs mb-3 text-xs font-semibold text-stone-700">
            <Building2 className="w-3.5 h-3.5 text-ml-mustard" />
            <span>Workspace Profile Configuration</span>
          </div>

          {/* Heading in DM Serif Display */}
          <h1 className="font-serif text-3xl sm:text-4xl md:text-[40px] font-normal text-ml-black tracking-tight leading-tight">
            Set up your business workspace<span className="text-ml-mustard">.</span>
          </h1>
          <p className="font-sans text-sm sm:text-base text-ml-text-secondary mt-2.5 leading-relaxed font-normal">
            Configure your store name and primary reporting currency to normalize statement accounts
            with integer precision.
          </p>

          {/* Setup Error Alert */}
          {submitError && (
            <div
              role="alert"
              className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-3 animate-in fade-in duration-150"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-900">Setup error</p>
                <p className="mt-0.5 text-rose-700 leading-relaxed">{submitError}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mt-6 space-y-5"
            aria-label="Organization setup form"
          >
            {/* Business / Organization Name Field */}
            <div>
              <label
                htmlFor="organizationName"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Business or Store Name
              </label>
              <div className="relative">
                <input
                  id="organizationName"
                  name="organizationName"
                  type="text"
                  autoComplete="organization"
                  value={organizationName}
                  onChange={(e) => {
                    setOrganizationName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  disabled={isSubmitting}
                  placeholder="e.g. The Local Pantry & Boutique"
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? 'name-error' : undefined}
                  className={`w-full px-4 py-2.5 sm:py-3 text-sm text-ml-black bg-white rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs ${
                    nameError
                      ? 'border-rose-400 focus-visible:ring-rose-400'
                      : 'border-ml-border-light hover:border-stone-400'
                  } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>
              {nameError && (
                <p id="name-error" role="alert" className="text-xs font-medium text-rose-600 mt-1">
                  {nameError}
                </p>
              )}
            </div>

            {/* Business Type Selector */}
            <div>
              <label
                htmlFor="businessType"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Storefront Category
              </label>
              <div className="relative">
                <select
                  id="businessType"
                  name="businessType"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 sm:py-3 text-sm text-ml-black bg-white rounded-xl border border-ml-border-light hover:border-stone-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs appearance-none"
                >
                  <option value="retail_boutique">Independent Retail Boutique / Apparel</option>
                  <option value="artisanal_goods">Artisanal Goods &amp; Specialty Gift Shop</option>
                  <option value="cafe_bakery">Cafe, Bakery &amp; Specialty Food Store</option>
                  <option value="grocer_market">Neighborhood Grocer &amp; General Store</option>
                  <option value="multi_store">Multi-Storefront Retail Operator</option>
                </select>
                <Store className="w-4 h-4 text-stone-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Base Currency Selector */}
            <div>
              <label
                htmlFor="currency"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Base Currency
              </label>
              <div className="relative">
                <select
                  id="currency"
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 sm:py-3 text-sm text-ml-black bg-white rounded-xl border border-ml-border-light hover:border-stone-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs appearance-none"
                >
                  <option value="USD">USD ($) — United States Dollar</option>
                  <option value="INR">INR (₹) — Indian Rupee</option>
                  <option value="EUR">EUR (€) — Euro</option>
                  <option value="GBP">GBP (£) — British Pound</option>
                </select>
                <Coins className="w-4 h-4 text-stone-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5 leading-relaxed">
                MoneyLens normalizes all statement imports against this primary reporting currency
                using integer minor-units.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2 bg-ml-mustard hover:bg-ml-mustard-hover text-ml-black font-semibold text-sm sm:text-base py-3 sm:py-3.5 px-6 rounded-full shadow-sm hover:shadow transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-black focus-visible:ring-offset-2 ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Configuring workspace...</span>
                </>
              ) : (
                <>
                  <span>Complete setup &amp; launch workspace</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.2]" />
                </>
              )}
            </button>
          </form>

          {/* Security & Isolation Reassurance Note */}
          <div className="mt-8 pt-5 border-t border-ml-border-light flex items-center justify-center gap-2 text-xs text-ml-text-secondary text-center">
            <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <span>Multi-tenant cryptographic isolation &bull; SHA-256 protected</span>
          </div>
        </div>

        {/* Quiet Footer */}
        <div className="text-xs text-stone-400 text-center sm:text-left pt-4">
          &copy; {new Date().getFullYear()} MoneyLens Platform. All rights reserved.
        </div>
      </div>

      {/* ============================================================ */}
      {/* RIGHT COLUMN: Restrained Editorial Commerce Showcase          */}
      {/* ============================================================ */}
      <div className="hidden lg:block lg:col-span-5 xl:col-span-6 relative bg-stone-900 overflow-hidden">
        {imageError ? (
          <div className="absolute inset-0 bg-[#171714] flex items-center justify-center p-12 text-center text-stone-400">
            <div>
              <span className="w-3 h-3 rounded-full bg-ml-mustard inline-block mb-3" />
              <p className="font-serif text-2xl text-white">MoneyLens Storefront Intelligence</p>
              <p className="text-sm text-stone-400 mt-2">
                Clarity for independent retail operations.
              </p>
            </div>
          </div>
        ) : (
          <img
            src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=80"
            alt="Warm sunlit artisan bakery and boutique storefront workspace with organized counter"
            className="w-full h-full object-cover object-center filter brightness-[0.88]"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}

        {/* Ambient Warm Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141412] via-[#141412]/40 to-transparent" />

        {/* Editorial Value Proposition Card */}
        <div className="absolute bottom-12 left-10 right-10 max-w-lg bg-white/95 backdrop-blur-md rounded-2xl p-6 border border-white/80 shadow-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600 mb-2">
            <span className="w-2 h-2 rounded-full bg-ml-mustard" />
            <span>Storefront Workspace Initialization</span>
          </div>
          <p className="font-serif text-lg text-ml-black font-normal leading-relaxed">
            &ldquo;Setting your base currency locks in integer minor-unit arithmetic, preventing
            rounding drift across bank statement reconciliations.&rdquo;
          </p>

          <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Dedicated tenant cryptographic boundary</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Multi-account statement normalization</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Proactive leakage &amp; anomaly detection engine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
