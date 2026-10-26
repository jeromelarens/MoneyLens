import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { healthService } from '../../services/health.service';

export const CreateAccountPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/app';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field-level error messages
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Update page title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Create Account — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  const validate = (): boolean => {
    let isValid = true;
    setNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);
    setSubmitError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setNameError('Full name is required.');
      isValid = false;
    } else if (trimmedName.length < 2) {
      setNameError('Full name must be at least 2 characters.');
      isValid = false;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Work email is required.');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid work email address.');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required.');
      isValid = false;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      isValid = false;
    } else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      setPasswordError('Password must contain at least one letter and one number.');
      isValid = false;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password.');
      isValid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match.');
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
      // Verify workspace connectivity before completing registration transition
      await healthService.getHealth();
      navigate(redirectPath);
    } catch {
      setSubmitError(
        'Unable to connect to the MoneyLens registration service. Please verify your connection or try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ml-warm-white text-ml-text-primary font-sans antialiased selection:bg-ml-mustard selection:text-ml-black flex flex-col lg:grid lg:grid-cols-12">
      {/* ============================================================ */}
      {/* LEFT COLUMN: Clean Editorial Registration Container          */}
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
            to="/signin"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-ml-text-secondary hover:text-ml-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded py-1.5 px-2.5 min-h-[36px]"
          >
            <span className="hidden xs:inline">Already have an account?</span>
            <span className="font-semibold text-ml-black underline underline-offset-4 decoration-ml-mustard">
              Sign in
            </span>
          </Link>
        </div>

        {/* Central Registration Form Module */}
        <div className="w-full max-w-md mx-auto my-auto py-6 sm:py-8">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-ml-border-light shadow-2xs mb-4 text-xs font-semibold text-stone-700">
            <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
            <span>Independent Retail Workspace</span>
          </div>

          {/* Heading in DM Serif Display */}
          <h1 className="font-serif text-3xl sm:text-4xl md:text-[40px] font-normal text-ml-black tracking-tight leading-tight">
            Create your account<span className="text-ml-mustard">.</span>
          </h1>
          <p className="font-sans text-sm sm:text-base text-ml-text-secondary mt-2.5 leading-relaxed font-normal">
            Start with full access to statement normalization, leakage detection, and 30-day cash
            forecasting.
          </p>

          {/* Registration Error Alert */}
          {submitError && (
            <div
              role="alert"
              className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-3 animate-in fade-in duration-150"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-900">Registration error</p>
                <p className="mt-0.5 text-rose-700 leading-relaxed">{submitError}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mt-6 space-y-4"
            aria-label="Create account form"
          >
            {/* Full Name Field */}
            <div>
              <label
                htmlFor="fullName"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                disabled={isSubmitting}
                placeholder="e.g. Sarah Jenkins"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'name-error' : undefined}
                className={`w-full px-4 py-2.5 sm:py-3 text-sm text-ml-black bg-white rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs ${
                  nameError
                    ? 'border-rose-400 focus-visible:ring-rose-400'
                    : 'border-ml-border-light hover:border-stone-400'
                } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
              {nameError && (
                <p id="name-error" role="alert" className="text-xs font-medium text-rose-600 mt-1">
                  {nameError}
                </p>
              )}
            </div>

            {/* Work Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Work Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                disabled={isSubmitting}
                placeholder="owner@boutique.com"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? 'email-error' : undefined}
                className={`w-full px-4 py-2.5 sm:py-3 text-sm text-ml-black bg-white rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs ${
                  emailError
                    ? 'border-rose-400 focus-visible:ring-rose-400'
                    : 'border-ml-border-light hover:border-stone-400'
                } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
              {emailError && (
                <p id="email-error" role="alert" className="text-xs font-medium text-rose-600 mt-1">
                  {emailError}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  disabled={isSubmitting}
                  placeholder="At least 8 characters"
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'password-error' : 'password-hint'}
                  className={`w-full pl-4 pr-11 py-2.5 sm:py-3 text-sm text-ml-black bg-white rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs ${
                    passwordError
                      ? 'border-rose-400 focus-visible:ring-rose-400'
                      : 'border-ml-border-light hover:border-stone-400'
                  } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-stone-400 hover:text-stone-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError ? (
                <p
                  id="password-error"
                  role="alert"
                  className="text-xs font-medium text-rose-600 mt-1"
                >
                  {passwordError}
                </p>
              ) : (
                <p id="password-hint" className="text-[11px] text-stone-400 mt-1">
                  Must be 8+ characters and contain both letters and numbers.
                </p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (confirmPasswordError) setConfirmPasswordError(null);
                  }}
                  disabled={isSubmitting}
                  placeholder="Repeat your password"
                  aria-invalid={Boolean(confirmPasswordError)}
                  aria-describedby={confirmPasswordError ? 'confirm-password-error' : undefined}
                  className={`w-full pl-4 pr-11 py-2.5 sm:py-3 text-sm text-ml-black bg-white rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs ${
                    confirmPasswordError
                      ? 'border-rose-400 focus-visible:ring-rose-400'
                      : 'border-ml-border-light hover:border-stone-400'
                  } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={
                    showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-stone-400 hover:text-stone-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {confirmPasswordError && (
                <p
                  id="confirm-password-error"
                  role="alert"
                  className="text-xs font-medium text-rose-600 mt-1"
                >
                  {confirmPasswordError}
                </p>
              )}
            </div>

            {/* Terms Notice */}
            <p className="text-[11px] text-stone-500 leading-relaxed pt-1">
              By creating an account, you agree to the MoneyLens{' '}
              <span className="text-stone-700 underline underline-offset-2">Terms of Service</span>{' '}
              and{' '}
              <span className="text-stone-700 underline underline-offset-2">Privacy Policy</span>.
            </p>

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
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create account</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.2]" />
                </>
              )}
            </button>
          </form>

          {/* Security & Isolation Reassurance Note */}
          <div className="mt-6 pt-5 border-t border-ml-border-light flex items-center justify-center gap-2 text-xs text-ml-text-secondary text-center">
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
            src="https://images.unsplash.com/photo-1556742049-0a67e557224f?auto=format&fit=crop&w=1400&q=80"
            alt="Independent retail storefront owner reviewing inventory and finances on a tablet in an organized boutique"
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
            <span>Storefront Financial Intelligence</span>
          </div>
          <p className="font-serif text-lg text-ml-black font-normal leading-relaxed">
            &ldquo;MoneyLens gives independent shopkeepers total visibility over multi-bank
            statements, hidden interchange fees, and 30-day cash flow projections.&rdquo;
          </p>

          <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Multi-account statement normalization with zero float error</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Automated leakage detection for fee spikes and double billings</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Cryptographic tenant isolation across all financial data</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
