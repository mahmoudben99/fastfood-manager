// Redirect to the canonical admin path
import { redirect } from 'next/navigation'
export default function UsersRedirect() {
  redirect('/admin/users')
}
