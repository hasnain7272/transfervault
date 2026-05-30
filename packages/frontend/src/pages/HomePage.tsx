import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Upload,
  Download,
  Shield,
  Zap,
  Lock,
  HardDrive,
  ArrowRight,
  Globe,
  RefreshCw,
  FileCheck2,
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

const features = [
  {
    icon: Lock,
    title: 'End-to-End Encrypted',
    description: 'Files are encrypted in your browser with AES-256-GCM before they leave your device.',
    color: 'from-violet-500 to-purple-600',
  },
  {
    icon: HardDrive,
    title: 'Your Storage, Your Rules',
    description:
      'Files never touch cloud servers. They live on your own hardware — always under your control.',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    icon: Zap,
    title: 'Blazing Fast',
    description: 'Direct transfers with no middleman. Speed is limited only by your connection.',
    color: 'from-amber-500 to-orange-600',
  },
  {
    icon: RefreshCw,
    title: 'Resumable Transfers',
    description: 'Connection dropped? Pick up right where you left off. No restarts, ever.',
    color: 'from-emerald-500 to-green-600',
  },
  {
    icon: FileCheck2,
    title: 'Verified Integrity',
    description: 'SHA-256 checksums verify every byte. What you send is exactly what they receive.',
    color: 'from-rose-500 to-pink-600',
  },
  {
    icon: Globe,
    title: 'Works Everywhere',
    description: 'Share a pairing code. Recipients download from any device, any browser, anywhere.',
    color: 'from-indigo-500 to-violet-600',
  },
];

export function HomePage() {
  return (
    <div className="relative overflow-hidden">
      {/* ── Hero Section ── */}
      <section className="relative min-h-[90vh] flex items-center justify-center hero-gradient">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-vault-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-cyan/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] dot-grid opacity-20 rounded-full" />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full bg-vault-500/10 border border-vault-500/20 px-4 py-1.5 text-xs font-medium text-vault-400 mb-8"
          >
            <Shield className="h-3.5 w-3.5" />
            Private file transfer — No cloud storage required
          </motion.div>

          {/* Headline */}
          <motion.h1
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6"
          >
            <span className="text-surface-950">Transfer files from</span>
            <br />
            <span className="gradient-text">your own storage</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mx-auto max-w-2xl text-lg sm:text-xl text-surface-600 mb-10 leading-relaxed"
          >
            Upload files to your own machine. Share a secure pairing code.
            Recipients download directly — no cloud, no third parties, no limits.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to="/upload"
              className="group btn-primary flex items-center gap-2.5 px-8 py-3.5 text-base"
            >
              <Upload className="h-5 w-5" />
              Start Uploading
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/download"
              className="btn-secondary flex items-center gap-2.5 px-8 py-3.5 text-base"
            >
              <Download className="h-5 w-5" />
              Enter Pair Code
            </Link>
          </motion.div>

          {/* Architecture visual */}
          <motion.div
            custom={3}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-20 mx-auto max-w-2xl"
          >
            <div className="glass rounded-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                {[
                  { icon: Globe, label: 'Browser', sublabel: 'Encrypt & Upload' },
                  { icon: Shield, label: 'Secure Link', sublabel: 'Pair Code' },
                  { icon: HardDrive, label: 'Your Laptop', sublabel: 'Local Storage' },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center gap-2 sm:gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-gradient-to-br from-vault-600/20 to-vault-400/10 border border-vault-500/20">
                        <step.icon className="h-5 w-5 sm:h-6 sm:w-6 text-vault-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs sm:text-sm font-semibold text-surface-800">
                          {step.label}
                        </p>
                        <p className="text-[10px] sm:text-xs text-surface-500">{step.sublabel}</p>
                      </div>
                    </div>
                    {i < 2 && (
                      <ArrowRight className="h-4 w-4 text-surface-500 flex-shrink-0 mx-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section className="relative py-24 sm:py-32 bg-surface-50/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 mb-4">
              Built for privacy and speed
            </h2>
            <p className="mx-auto max-w-2xl text-surface-600 text-lg">
              Enterprise-grade security without the enterprise. Every feature designed
              to keep your files private and your transfers fast.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="card p-6 group"
              >
                <div
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} mb-4 shadow-lg transition-transform group-hover:scale-110`}
                >
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-surface-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-surface-600 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works Section ── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 mb-4">
              Three steps. That's it.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Upload Your Files',
                description:
                  'Drag and drop files of any size. They are uploaded directly to your own machine with resumable transfers.',
                icon: Upload,
              },
              {
                step: '02',
                title: 'Share the Code',
                description:
                  'Get a unique pairing code like X7K9-N2QM-P8Z4. Share it with anyone — the key to your files.',
                icon: Shield,
              },
              {
                step: '03',
                title: 'They Download',
                description:
                  'Recipients enter the code and download directly from your machine. Fast, private, no account needed.',
                icon: Download,
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="relative text-center"
              >
                <div className="mb-6">
                  <span className="text-7xl font-black text-surface-200/50">
                    {item.step}
                  </span>
                </div>
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-vault-500/10 border border-vault-500/20 mb-4">
                  <item.icon className="h-6 w-6 text-vault-400" />
                </div>
                <h3 className="text-xl font-semibold text-surface-900 mb-3">
                  {item.title}
                </h3>
                <p className="text-surface-600 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative glass rounded-3xl p-12 sm:p-16 text-center overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-vault-600/5 to-accent-cyan/5 pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-surface-950 mb-4">
                Ready to transfer?
              </h2>
              <p className="text-surface-600 text-lg mb-8 max-w-xl mx-auto">
                No sign-up required. Upload files, get a code, share it. That simple.
              </p>
              <Link
                to="/upload"
                className="group btn-primary inline-flex items-center gap-2.5 px-10 py-4 text-lg"
              >
                <Upload className="h-5 w-5" />
                Start Uploading Now
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
