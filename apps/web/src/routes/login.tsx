import { useState } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { SITE_SHORT_NAME } from '@base/core/config/event';
import { Button } from '@base/ui/components/button';
import { Input } from '@base/ui/components/input';

import { getServerSession } from '~/apis/auth';
import { authClient } from '~/utils/auth-client';
import { getDashboardUrlForUser } from '~/utils/auth-redirect';

export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [{ title: `Login - ${SITE_SHORT_NAME}` }],
  }),
  beforeLoad: async () => {
    const session = await getServerSession();
    if (session) {
      const dashboardUrl = getDashboardUrlForUser(session.user);
      throw redirect({
        to: dashboardUrl,
      });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: '/login-success',
    });

    if (error) {
      setError(error.message || 'Failed to send magic link');
      setSuccess(false);
    } else {
      setSuccess(true);
    }

    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);

    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/login-success',
    });

    if (error) {
      setError(error.message || 'Failed to sign in with Google');
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Hackathon Platform</h2>
          <p className="mt-2 text-sm text-gray-600">Sign in to access your dashboard</p>
        </div>

        {success ? (
          <div className="rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Magic link sent!</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>
                    Check your email at <strong>{email}</strong> for the login link.
                  </p>
                </div>
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSuccess(false)}
                    className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  >
                    Try another email
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Login failed</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-5 w-5" aria-hidden="true" viewBox="0 0 24 24">
                    <path
                      d="M12.0003 20.45C16.6663 20.45 20.587 17.178 21.954 12.954H12.0003V9.54599H23.5453C23.6863 10.273 23.7723 11.045 23.7723 11.864C23.7723 18.591 18.4993 24 12.0003 24C5.3723 24 0.000299454 18.628 0.000299454 12C0.000299454 5.372 5.3723 0 12.0003 0C15.0003 0 17.6623 1.028 19.7663 2.737L17.2543 5.25C15.9913 4.178 14.1893 3.546 12.0003 3.546C7.5533 3.546 3.8153 6.955 3.5683 11.318H3.5633V11.326C3.4803 11.545 3.4383 11.77 3.4383 12C3.4383 12.23 3.4803 12.455 3.5633 12.674V12.682H3.5683C3.8153 17.045 7.5533 20.45 12.0003 20.45Z"
                      fill="currentColor"
                    />
                  </svg>
                )}
                Continue with Google
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">or</span>
              </div>
            </div>

            <div className="rounded-lg bg-white">
              <form className="space-y-4" onSubmit={handleMagicLink}>
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                    Login with Email
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="participant@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Link...
                    </>
                  ) : (
                    'Send Magic Link'
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
