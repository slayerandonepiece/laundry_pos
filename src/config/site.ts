export const siteConfig = {
  name: 'Express Laundry', area: 'Chinnappanahalli', phoneDisplay: '94949 30898', phoneHref: 'tel:+919494930898',
  whatsappNumber: '919494930898',
  address: ['Plot No. 60, M.N. Naidu Enclave,', '10th Cross, Friends Layout,', 'Chinnappanahalli, Bengaluru 560037'],
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Express+Laundry+Chinnappanahalli+Bengaluru',
  mapEmbedUrl: 'https://www.google.com/maps?q=Express%20Laundry%20Chinnappanahalli%20Bengaluru&output=embed',
} as const;

export const bookingMessage = 'Hi Express Laundry, I would like to schedule a pickup.';
export const whatsappUrl = (message = bookingMessage) => `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;
