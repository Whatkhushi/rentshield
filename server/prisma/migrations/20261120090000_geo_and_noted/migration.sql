-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('EXIF', 'DEVICE');

-- AlterEnum
ALTER TYPE "ReviewStatus" ADD VALUE 'NOTED';

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationSource" "LocationSource",
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "takenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

