import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Uploads a base64 / data URI or remote URL to Cloudinary.
export async function uploadToCloudinary(fileStr, folder = "myprepmart") {
  const result = await cloudinary.uploader.upload(fileStr, { folder });
  return result.secure_url;
}

export default cloudinary;
