export type PropertyStatus = "For Sale" | "For Rent" | "Sold";

export type PropertyType =
  | "Villa"
  | "Apartment"
  | "Duplex"
  | "Townhouse"
  | "Studio"
  | "Penthouse"
  | "Bungalow"
  | "Mansion"
  | "Terrace";

export interface Agent {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  avatarUrl: string;
}

export interface Property {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  price: number;
  status: PropertyStatus;
  type: PropertyType;
  location: string;
  city: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  areaSqft: number;
  parkingSpaces: number;
  yearBuilt: number;
  featured?: boolean;
  amenities: string[];
  images: string[];
  agent: Agent;
  createdAt: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  quote: string;
  rating: number;
  initials: string;
}

export interface SiteStat {
  /** Numeric target the counter animates toward. */
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
}

export interface Insight {
  id: string;
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  publishedAt: string;
  author: string;
  image: string;
  featured?: boolean;
}
