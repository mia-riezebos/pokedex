import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Container } from '@/components/chrome/Container';
import { ProfileForm } from './ProfileForm';
import { AvatarUploader } from './AvatarUploader';
import { Avatar } from '@/components/user/Avatar';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/settings');

  return (
    <Container>
      <div className="py-8 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <div className="title-rule mt-2" />
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Avatar</h2>
          <div className="flex items-center gap-6">
            <Avatar userId={user.username} url={user.avatar_url} size={96} />
            <AvatarUploader currentUrl={user.avatar_url} />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Profile</h2>
          <ProfileForm
            initialDisplayName={user.display_name ?? ''}
            initialBio={user.bio ?? ''}
            initialSignature={user.signature_md ?? ''}
          />
        </section>
      </div>
    </Container>
  );
}
