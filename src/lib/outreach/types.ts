export interface OutreachContext {
  company: {
    name: string;
    industry?: string;
    location?: string;
    description?: string;
  };
  contact: {
    firstName: string;
    jobTitle: string;
  };
  signals: Array<{ name: string; evidence: string }>;
  offer: {
    description: string;
    valueProposition: string;
  };
}