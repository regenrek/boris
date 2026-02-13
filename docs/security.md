# Security

## Secret Handling Rules

- Never commit `.env`
- Never put real token values in docs/examples
- Use placeholders only in public markdown
- Store production secrets in Vercel environment variables

## Minimum Required Access

Slack:

- Use only required bot scopes
- Rotate token if exposure is suspected

Notion:

- Use a dedicated integration per environment if possible
- Share only required task/project databases with integration

OpenAI:

- Restrict key permissions and monitor usage

## Data Handling Notes

- Slack requests are signature-verified before processing
- Task data is sent to Notion and model provider for parsing
- Avoid sending sensitive secrets in Slack task prompts

## Public Repo Checklist

- No real IDs/tokens in docs
- No customer data in examples
- No deployment URLs that reveal internal systems

## If You Suspect Secret Exposure

1. Revoke/rotate leaked credential immediately
2. Update secret in local and production environments
3. Redeploy app
4. Review logs for suspicious use during exposure window
