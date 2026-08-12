export const env: { readonly PUBLIC_FEATURE_MARKETING_SITE: string | undefined } = {
  get PUBLIC_FEATURE_MARKETING_SITE() {
    return process.env.PUBLIC_FEATURE_MARKETING_SITE;
  },
};
