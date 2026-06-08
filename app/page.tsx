import { redirect } from 'next/navigation'

// The dashboard is the app entry now. The old landing (Hero/Features/CTA)
// was removed; the components in components/landing/* are unreferenced and
// can be deleted in a follow-up cleanup.
export default function Root() {
  redirect('/dashboard')
}
