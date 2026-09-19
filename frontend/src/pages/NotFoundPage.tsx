import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Brand } from '../components/ui/Brand';

export function NotFoundPage() {
  return (
    <main className="not-found">
      <Brand />
      <p className="eyebrow">404 / Signal not found</p>
      <h1>This route is outside the monitored path.</h1>
      <p>The page you requested does not exist.</p>
      <Link className="button button--primary" to="/"><ArrowLeft size={15} aria-hidden="true" /> Return home</Link>
    </main>
  );
}
