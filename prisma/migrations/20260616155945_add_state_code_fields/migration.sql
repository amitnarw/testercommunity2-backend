-- AlterTable
ALTER TABLE "billing_info" ADD COLUMN     "stateCode" TEXT;

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "state_code" TEXT;

-- Backfill billing_info.stateCode from existing state names
UPDATE "billing_info" SET "stateCode" = CASE "state"
  WHEN 'Jammu and Kashmir' THEN '01'
  WHEN 'Himachal Pradesh' THEN '02'
  WHEN 'Punjab' THEN '03'
  WHEN 'Chandigarh' THEN '04'
  WHEN 'Uttarakhand' THEN '05'
  WHEN 'Haryana' THEN '06'
  WHEN 'Delhi' THEN '07'
  WHEN 'Rajasthan' THEN '08'
  WHEN 'Uttar Pradesh' THEN '09'
  WHEN 'Bihar' THEN '10'
  WHEN 'Sikkim' THEN '11'
  WHEN 'Arunachal Pradesh' THEN '12'
  WHEN 'Nagaland' THEN '13'
  WHEN 'Manipur' THEN '14'
  WHEN 'Mizoram' THEN '15'
  WHEN 'Tripura' THEN '16'
  WHEN 'Meghalaya' THEN '17'
  WHEN 'Assam' THEN '18'
  WHEN 'West Bengal' THEN '19'
  WHEN 'Jharkhand' THEN '20'
  WHEN 'Odisha' THEN '21'
  WHEN 'Chhattisgarh' THEN '22'
  WHEN 'Madhya Pradesh' THEN '23'
  WHEN 'Gujarat' THEN '24'
  WHEN 'Daman and Diu' THEN '25'
  WHEN 'Dadra and Nagar Haveli' THEN '26'
  WHEN 'Maharashtra' THEN '27'
  WHEN 'Andhra Pradesh' THEN '28'
  WHEN 'Karnataka' THEN '29'
  WHEN 'Goa' THEN '30'
  WHEN 'Lakshadweep' THEN '31'
  WHEN 'Kerala' THEN '32'
  WHEN 'Tamil Nadu' THEN '33'
  WHEN 'Puducherry' THEN '34'
  WHEN 'Andaman and Nicobar Islands' THEN '35'
  WHEN 'Telangana' THEN '36'
  WHEN 'Ladakh' THEN '38'
  ELSE NULL
END WHERE "stateCode" IS NULL;

-- Backfill invoice.state_code by joining with billing_info
UPDATE "invoice" i
SET "state_code" = b."stateCode"
FROM "billing_info" b
WHERE i."userId" = b."userId"
  AND i."state_code" IS NULL
  AND b."stateCode" IS NOT NULL;
