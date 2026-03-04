import mongoose from "mongoose";

const ReceiptSchema = new mongoose.Schema(
  {
    data: Buffer,
    contentType: String,
    filename: String,
    uploadedAt: String,
  },
  { _id: false }
);

const RegistrationSchema = new mongoose.Schema(
  {
    childFullName: String,
    birthDate: String,
    childId: String,
    ageGroup: String,

    motherName: String,
    motherPhone: String,
    fatherName: String,
    fatherPhone: String,

    stayUntil: String,
    address: String,

    hasAllergy: String,
    allergyDetails: String,
    hasDisease: String,
    diseaseDetails: String,
    notes: String,

    status: { type: String, default: "new" },

    approvedNotifiedAt: String,
    rejectedNotifiedAt: String,
    promotedAt: String,

    receipt: { type: ReceiptSchema, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Registration", RegistrationSchema);