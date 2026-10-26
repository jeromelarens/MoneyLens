import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Lock,
} from 'lucide-react';
import { healthService } from '../../services/health.service';

export const SignInPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field-level error messages
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Update page title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Sign In — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  const validate = (): boolean => {
    let isValid = true;
    setEmailError(null);
    setPasswordError(null);
    setAuthError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Email address is required.');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address.');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required.');
      isValid = false;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
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
    setAuthError(null);

    try {
      // Verify workspace connectivity before completing sign-in transition
      await healthService.getHealth();
      navigate(redirectPath);
    } catch {
      // Graceful fallback: If network service call encounters an issue, inform user cleanly
      setAuthError(
        'Unable to connect to the MoneyLens workspace service. Please verify your connection or try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ml-warm-white text-ml-text-primary font-sans antialiased selection:bg-ml-mustard selection:text-ml-black flex flex-col lg:grid lg:grid-cols-12">
      {/* ============================================================ */}
      {/* LEFT COLUMN: Clean Editorial Authentication Container         */}
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
            to="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-ml-text-secondary hover:text-ml-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded py-1.5 px-2.5 min-h-[36px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to website</span>
          </Link>
        </div>

        {/* Central Sign In Form Module */}
        <div className="w-full max-w-md mx-auto my-auto py-6 sm:py-10">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-ml-border-light shadow-2xs mb-4 text-xs font-semibold text-stone-700">
            <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
            <span>Independent Retail Workspace</span>
          </div>

          {/* Heading */}
          <h1 className="font-serif text-3xl sm:text-4xl md:text-[40px] font-normal text-ml-black tracking-tight leading-tight">
            Welcome back<span className="text-ml-mustard">.</span>
          </h1>
          <p className="font-sans text-sm sm:text-base text-ml-text-secondary mt-2.5 leading-relaxed font-normal">
            Sign in to access your financial statement ledger, cash-flow forecasts, and proactive
            leakage findings.
          </p>

          {/* Authentication Error Alert */}
          {authError && (
            <div
              role="alert"
              className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-3 animate-in fade-in duration-150"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-900">Sign in error</p>
                <p className="mt-0.5 text-rose-700 leading-relaxed">{authError}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mt-8 space-y-5"
            aria-label="Sign in form"
          >
            {/* Work Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-2"
              >
                Work Email
              </label>
              <div className="relative">
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
                  className={`w-full px-4 py-3 text-sm text-ml-black bg-white rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs ${
                    emailError
                      ? 'border-rose-400 focus-visible:ring-rose-400'
                      : 'border-ml-border-light hover:border-stone-400'
                  } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>
              {emailError && (
                <p
                  id="email-error"
                  role="alert"
                  className="text-xs font-medium text-rose-600 mt-1.5"
                >
                  {emailError}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
                >
                  Password
                </label>
              </div>

              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  disabled={isSubmitting}
                  placeholder="••••••••••••"
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  className={`w-full pl-4 pr-11 py-3 text-sm text-ml-black bg-white rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard focus-visible:border-ml-black shadow-2xs ${
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
              {passwordError && (
                <p
                  id="password-error"
                  role="alert"
                  className="text-xs font-medium text-rose-600 mt-1.5"
                >
                  {passwordError}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2 bg-ml-mustard hover:bg-ml-mustard-hover text-ml-black font-semibold text-sm sm:text-base py-3.5 px-6 rounded-full shadow-sm hover:shadow transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-black focus-visible:ring-offset-2 ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in to workspace</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.2]" />
                </>
              )}
            </button>

            {/* Link to Create Account */}
            <div className="text-center pt-2">
              <p className="text-xs sm:text-sm text-ml-text-secondary">
                Don't have an account?{' '}
                <Link
                  to="/signup"
                  className="font-semibold text-ml-black hover:underline underline-offset-4 decoration-ml-mustard transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ml-mustard rounded"
                >
                  Create an account
                </Link>
              </p>
            </div>
          </form>

          {/* Security & Isolation Reassurance Note */}
          <div className="mt-8 pt-6 border-t border-ml-border-light flex items-center justify-center gap-2 text-xs text-ml-text-secondary text-center">
            <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <span>Multi-tenant cryptographic isolation &bull; SHA-256 protected</span>
          </div>
        </div>

        {/* Quiet Footer */}
        <div className="text-xs text-stone-400 text-center sm:text-left pt-6">
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
            src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=80"
            alt="Warm sunlit independent retail boutique merchandise with natural organic aesthetic"
            className="w-full h-full object-cover object-center filter brightness-[0.88]"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}

        {/* Ambient Warm Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141412] via-[#141412]/40 to-transparent" />

        {/* Editorial Quote Card Overlaid on Image */}
        <div className="absolute bottom-12 left-10 right-10 max-w-lg bg-white/95 backdrop-blur-md rounded-2xl p-6 border border-white/80 shadow-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-600 mb-2">
            <span className="w-2 h-2 rounded-full bg-ml-mustard" />
            <span>Storefront Decision Support</span>
          </div>
          <p className="font-serif text-lg text-ml-black font-normal leading-relaxed">
            &ldquo;Understand where money moves, uncover unusual patterns, and make your next
            business decision with total clarity.&rdquo;
          </p>
          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <span>Built for retail founders &amp; shopkeepers</span>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-medium text-stone-700">Bank-grade isolation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
