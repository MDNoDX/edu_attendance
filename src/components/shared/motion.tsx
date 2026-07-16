"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

/**
 * Shared entrance-animation primitives (framer-motion was already an
 * installed dependency but never actually used anywhere in the app before
 * this — dead weight). Used to give stat-card grids and key content blocks
 * a tasteful, staggered fade/slide-in on mount instead of popping in
 * instantly, without turning every page into a motion showcase.
 *
 * Server Components (most dashboard pages) render these as regular child
 * components — `FadeInStagger`/`FadeInItem` are the only "use client"
 * boundary needed, the page itself stays a Server Component.
 *
 * Respects prefers-reduced-motion via framer-motion's useReducedMotion():
 * falls back to a plain <div>, no motion at all, for anyone who's told
 * their OS they don't want animated interfaces.
 */

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.02 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
};

export function FadeInStagger({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={containerVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function FadeInItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
