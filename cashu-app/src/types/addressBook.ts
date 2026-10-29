export type ContactType = 'momo' | 'lightning' | 'onchain';

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  value: string; // phone number e.g. "0771234567" / "+256...", or lightning address e.g. "user@domain.com"
  network?: string; // For MoMo: 'mtn' | 'airtel' | 'vodafone' | etc.
  currency?: string; // For MoMo: 'UGX' | 'KES' | 'GHS' | 'RWF' etc.
  notes?: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  isFavorite?: boolean;
}
