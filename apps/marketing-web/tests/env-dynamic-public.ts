export const env: {
  readonly PUBLIC_FEATURE_MARKETING_SITE: string | undefined;
  readonly PUBLIC_API_BASE: string | undefined;
  readonly PUBLIC_POS_ORIGIN: string | undefined;
} = {
  get PUBLIC_FEATURE_MARKETING_SITE() {
    return process.env.PUBLIC_FEATURE_MARKETING_SITE;
  },
  get PUBLIC_API_BASE() {
    return process.env.PUBLIC_API_BASE;
  },
  get PUBLIC_POS_ORIGIN() {
    return process.env.PUBLIC_POS_ORIGIN;
  },
};
