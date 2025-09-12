import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
  Section,
  Img,
} from 'npm:@react-email/components@0.0.22'
import * as React from 'npm:react@18.3.1'

interface ConfirmationEmailProps {
  supabase_url: string
  email_action_type: string
  redirect_to: string
  token_hash: string
  token: string
  user_email: string
}

export const ConfirmationEmail = ({
  token,
  supabase_url,
  email_action_type,
  redirect_to,
  token_hash,
  user_email,
}: ConfirmationEmailProps) => (
  <Html>
    <Head />
    <Preview>Confirm your Document Extractor account</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header with gradient background */}
        <Section style={headerSection}>
          <Section style={logoSection}>
            <Img
              src="https://xnpmrafjjqsissbtempj.supabase.co/storage/v1/object/public/assets/document-extractor-logo.png"
              width="48"
              height="48"
              alt="Document Extractor"
              style={logo}
            />
          </Section>
          <Heading style={h1}>Welcome to Document Extractor!</Heading>
        </Section>
        
        {/* Main content */}
        <Section style={contentSection}>
          <Text style={text}>
            Hi there! Thanks for signing up for Document Extractor. To get started, please confirm your email address by clicking the button below.
          </Text>
          
          <Section style={buttonSection}>
            <Link
              href={`${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`}
              target="_blank"
              style={button}
            >
              Confirm Email Address
            </Link>
          </Section>
          
          <Text style={text}>
            Or copy and paste this link into your browser:
          </Text>
          
          <Text style={linkText}>
            {`${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`}
          </Text>
        </Section>
        
        {/* Footer */}
        <Section style={footerSection}>
          <Text style={footerText}>
            If you didn't create an account with Document Extractor, you can safely ignore this email.
          </Text>
          
          <Text style={footer}>
            Best regards,<br />
            The Document Extractor Team
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ConfirmationEmail

const main = {
  backgroundColor: 'hsl(210, 40%, 98%)', // --background
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
  padding: '0',
  margin: '0',
}

const container = {
  backgroundColor: 'hsl(0, 0%, 100%)', // --card
  margin: '0 auto',
  maxWidth: '600px',
  border: '1px solid hsl(214, 32%, 91%)', // --border
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 10px 30px -10px hsl(215, 80%, 40%, 0.3)', // --shadow-primary
}

const headerSection = {
  background: 'linear-gradient(135deg, hsl(215, 80%, 40%), hsl(230, 60%, 60%))', // --gradient-primary
  padding: '32px 0 40px',
  textAlign: 'center' as const,
}

const logoSection = {
  textAlign: 'center' as const,
  marginBottom: '24px',
}

const logo = {
  margin: '0 auto',
  filter: 'brightness(0) invert(1)', // Make logo white on gradient background
}

const h1 = {
  color: 'hsl(210, 40%, 98%)', // --primary-foreground
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.2',
  margin: '0',
  padding: '0',
  textAlign: 'center' as const,
}

const contentSection = {
  padding: '40px 32px',
}

const text = {
  color: 'hsl(222, 47%, 11%)', // --foreground
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 24px 0',
}

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  background: 'linear-gradient(135deg, hsl(215, 80%, 40%), hsl(230, 60%, 60%))', // --gradient-primary
  borderRadius: '12px',
  color: 'hsl(210, 40%, 98%)', // --primary-foreground
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600',
  lineHeight: '1',
  padding: '16px 32px',
  textDecoration: 'none',
  border: 'none',
  boxShadow: '0 4px 12px hsl(215, 80%, 40%, 0.3)',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
}

const linkText = {
  color: 'hsl(215, 16%, 47%)', // --muted-foreground
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '24px 0',
  wordBreak: 'break-all' as const,
  padding: '16px',
  backgroundColor: 'hsl(210, 40%, 96%)', // --muted
  borderRadius: '8px',
  border: '1px solid hsl(214, 32%, 91%)', // --border
}

const footerSection = {
  backgroundColor: 'hsl(210, 40%, 96%)', // --muted
  padding: '32px',
  borderTop: '1px solid hsl(214, 32%, 91%)', // --border
}

const footerText = {
  color: 'hsl(215, 16%, 47%)', // --muted-foreground
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 16px 0',
}

const footer = {
  color: 'hsl(215, 16%, 47%)', // --muted-foreground
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
  fontWeight: '500',
}