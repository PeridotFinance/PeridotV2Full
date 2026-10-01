import { Metadata } from 'next'
import RedeemClient from './RedeemClient'

export const metadata: Metadata = {
  title: 'Redeem Secret Code | Peridot',
  description: 'Enter your secret code to unlock exclusive rewards and points.',
}

export default function RedeemPage() {
  return <RedeemClient />
}

