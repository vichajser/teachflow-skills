// 与站点的 src/config/site.ts 同源。test/watermark.test.ts 末尾会读 site.ts
// 比对两处取值，改了一边没改另一边会直接测试失败——shop-api 是独立包，
// 没有共享导入，只能靠测试对齐。

export const BRAND = {
  productName: 'TeachFlow',
  companyName: 'CROSSXTOP LTD',
  companyNumber: '16339041',
  registeredIn: 'England and Wales',
  supportEmail: 'crossxtop@gmail.com',
  licenceId: 'LicenseRef-TeachFlow-Proprietary',
} as const;
