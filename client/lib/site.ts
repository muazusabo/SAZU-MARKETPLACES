import {
  BedDouble, BookOpen, Armchair, Gamepad2, Package, Shirt, Smartphone, Sparkles, UtensilsCrossed, Wrench,
  type LucideIcon,
} from 'lucide-react';

export const SITE = {
  name: 'SAZU Marketplace',
  tagline: 'Sa’adu Zungur University marketplace.',
  description:
    "A campus marketplace for students of Sa'adu Zungur University, Gadau. Discover products and services and message student sellers directly.",
  paymentDisclaimer:
    'SAZU Marketplace helps students discover products and connect with sellers. Buyers and sellers arrange payment, collection, and delivery directly. Always verify products and sellers before making payment.',
} as const;

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/browse', label: 'Browse products' },
  { href: '/categories', label: 'Categories' },
  { href: '/sell', label: 'Sell on SAZU' },
] as const;

/**
 * Category taxonomy from the product brief. In Phase 3 the category pages read
 * this from the database (administrators manage it); these slugs are the seed values.
 */
export const CATEGORIES: { slug: string; name: string; icon: LucideIcon }[] = [
  { slug: 'electronics', name: 'Electronics', icon: Smartphone },
  { slug: 'books-study-materials', name: 'Books and Study Materials', icon: BookOpen },
  { slug: 'food-drinks', name: 'Food and Drinks', icon: UtensilsCrossed },
  { slug: 'fashion-accessories', name: 'Fashion and Accessories', icon: Shirt },
  { slug: 'beauty-personal-care', name: 'Beauty and Personal Care', icon: Sparkles },
  { slug: 'hostel-room-essentials', name: 'Hostel and Room Essentials', icon: BedDouble },
  { slug: 'furniture', name: 'Furniture', icon: Armchair },
  { slug: 'student-services', name: 'Student Services', icon: Wrench },
  { slug: 'sports-gaming', name: 'Sports and Gaming', icon: Gamepad2 },
  { slug: 'other-approved-products', name: 'Other Approved Products', icon: Package },
];

/** Homepage "affordable essentials" threshold. Becomes an administrator setting in Phase 7. */
export const AFFORDABLE_MAX_NAIRA = 5000;
