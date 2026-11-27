import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Code2, CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { CreditTransaction } from '../types/voicelab';

export function BillingAndApiPage() {
  const { firebaseUser, profile, appSettings, secondsUntilRefill, refillingCredits } = useAuth();
  const { notify } = useToast();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [openApiJson, setOpenApiJson] = useState<string>('');

  const mins = Math.floor(secondsUntilRefill / 60);
  const secs = secondsUntilRefill % 60;
  const refillTimerLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'creditTransactions'), where('ownerId', '==', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CreditTransaction, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setTransactions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'creditTransactions')
    );
    return () => unsub();
  }, [firebaseUser]);

  useEffect(() => {
    fetch('/api/v1/openapi.json')
      .then(async (r) => {
        const text = await r.text();
        if (!text.trim() || text.trimStart().startsWith('<')) return;
        const data = JSON.parse(text);
        setOpenApiJson(JSON.stringify(data, null, 2));
      })
      .catch(() => {});
  }, []);

  const plans = [
    {
      name: 'Free',
      audience: 'For individual creators',
      price: '$0 / mo',
      credits: '10,000 credits · Auto-refill every 30 min',
      cloning: 'Unlimited Free Voice Cloning (0 credits)',
      features: 'Bangla & English TTS · Audio Studio DSP · Private samples',
      active: (profile?.plan || 'free') === 'free',
    },
    {
      name: 'Creator',
      audience: 'For YouTubers & storytellers',
      price: '$19 / mo',
      credits: '50,000 monthly credits',
      cloning: 'Unlimited Free Voice Cloning (0 credits)',
      features: 'Priority queue · Emotion presets · Multi-speaker podcasts',
      active: profile?.plan === 'creator',
    },
    {
      name: 'Pro',
      audience: 'For commercial studios',
      price: '$49 / mo',
      credits: '200,000 monthly credits',
      cloning: 'Unlimited Free Voice Cloning (0 credits)',
      features: 'AI Dubbing · Voice Changer · Higher worker concurrency',
      active: profile?.plan === 'pro',
    },
    {
      name: 'Studio',
      audience: 'For media teams & agencies',
      price: '$149 / mo',
      credits: '1,000,000 monthly credits',
      cloning: 'Unlimited Free Voice Cloning (0 credits)',
      features: 'Dedicated GPU routing · Team seats · Commercial API SLA',
      active: profile?.plan === 'studio',
    },
  ];

  const handleCheckout = (planName: string) => {
    notify(
      `${planName} checkout requires a payment gateway`,
      'info',
      'Configure Stripe, Paddle, or SSLCommerz / bKash webhook keys on the server before accepting live payments.'
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Plans, Credits &amp; Developer API
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Voice cloning is always 0 credits on every tier · Dynamic feature costs configured by admin
        </p>
      </div>

      {/* Configured Feature Costs */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Active Credit Pricing Rules</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
            <div className="text-slate-500 dark:text-slate-400">30-Min Auto-Refill</div>
            <div className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 tabular-nums">
              {refillingCredits
                ? 'Refilling 10,000...'
                : (profile?.credits ?? 0) >= 10000
                ? '10,000 / 10,000 Ready'
                : `10,000 in ${refillTimerLabel}`}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-slate-500 dark:text-slate-400">Voice Cloning</div>
            <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
              0 credits (Free)
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-slate-500 dark:text-slate-400">TTS / 1k chars</div>
            <div className="font-mono font-semibold mt-0.5">{appSettings.ttsCostPer1kChars} credits</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-slate-500 dark:text-slate-400">Voice Changer</div>
            <div className="font-mono font-semibold mt-0.5">{appSettings.voiceChangerCost ?? 20} credits</div>
          </div>
        </div>
      </section>

      {/* Subscription Plans */}
      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`rounded-xl border p-5 flex flex-col justify-between gap-4 ${
              p.active
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E]'
            }`}
          >
            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">{p.audience}</div>
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{p.name}</h3>
                <span className="text-sm font-mono font-semibold">{p.price}</span>
              </div>
              <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {p.credits}
              </div>
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {p.cloning}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 pt-1">{p.features}</p>
            </div>

            <button
              type="button"
              disabled={p.active}
              onClick={() => handleCheckout(p.name)}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium transition-colors"
            >
              {p.active ? 'Current Plan' : `Upgrade to ${p.name}`}
            </button>
          </div>
        ))}
      </section>

      {/* Credit Ledger & OpenAPI */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold">Credit Ledger</h2>
          </div>

          {transactions.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              No credit deductions recorded yet. Voice cloning always uses 0 credits.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {transactions.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">{tx.description}</div>
                    <div className="text-slate-500 dark:text-slate-400">{tx.type}</div>
                  </div>
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      tx.amount >= 0 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold">Developer REST API (OpenAPI 3.0)</h2>
            </div>
            <a
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline"
            >
              <span>JSON Spec</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <pre className="rounded-lg bg-slate-950 text-slate-200 p-3 text-[11px] font-mono overflow-x-auto max-h-64">
            {openApiJson || 'Loading OpenAPI specification...'}
          </pre>
        </div>
      </section>
    </div>
  );
}
