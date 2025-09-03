import DocumentProcessor from './DocumentProcessor';
import SubscriptionGuard, { SubscriptionRequired } from '@/components/SubscriptionGuard';

const Index = () => {
  return (
    <SubscriptionGuard fallback={<SubscriptionRequired />}>
      <DocumentProcessor />
    </SubscriptionGuard>
  );
};

export default Index;