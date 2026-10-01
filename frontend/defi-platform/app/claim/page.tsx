import { Metadata } from 'next'
import ClaimClient from './ClaimClient'

export const metadata: Metadata = {
  title: 'Claim Rewards | Peridot',
  description: 'Claim your MERKL rewards and Peridot boost earnings.',
}

export default function ClaimPage() {
  return <ClaimClient />
}
