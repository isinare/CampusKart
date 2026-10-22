/*
 * MongoDB JSON Schema validation rules for the CampusKart collections.
 *
 * They mirror the important MySQL CHECK constraints and ENUMs. The rules are
 * applied with validationLevel "moderate" so adding a new optional field never
 * makes an existing document unreadable, while new writes must keep the core
 * identity, enum and relationship fields valid.
 */
const VALIDATORS = {
  users: {
    $jsonSchema: {
      bsonType: "object",
      required: ["U_ID", "U_FirstName", "U_LastName", "U_Email", "U_PasswordHash", "U_Role"],
      properties: {
        U_ID: { bsonType: "string", pattern: "^U[0-9]+$" },
        U_Email: { bsonType: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
        U_Role: { enum: ["STUDENT", "ADMIN"] },
        U_IsActive: { bsonType: ["int", "bool"] },
      },
    },
  },
  student: {
    $jsonSchema: {
      bsonType: "object",
      required: ["U_ID", "St_CollegeID", "St_NameOnId", "St_VerificationStatus", "Br_ID", "Ins_ID"],
      properties: {
        U_ID: { bsonType: "string", pattern: "^U[0-9]+$" },
        St_VerificationStatus: { enum: ["PENDING", "VERIFIED", "REJECTED"] },
        St_Gender: { enum: ["Male", "Female", "Other"] },
      },
    },
  },
  item: {
    $jsonSchema: {
      bsonType: "object",
      required: ["I_ID", "I_Name", "I_SellingPrice", "I_Condition", "I_Status", "I_Kind", "U_ID", "Cat_ID"],
      properties: {
        I_ID: { bsonType: "string", pattern: "^I[0-9]+$" },
        I_Name: { bsonType: "string", minLength: 1, maxLength: 60 },
        I_SellingPrice: { bsonType: ["int", "double"], minimum: 0 },
        I_Condition: { enum: ["NEW", "GOOD", "FAIR", "POOR"] },
        I_Status: { enum: ["AVAILABLE", "BUY_REQUESTED", "RESERVED", "ACCEPTED", "SOLD", "WITHDRAWN", "REMOVED"] },
        I_Kind: { enum: ["ACADEMIC", "GENERAL"] },
      },
    },
  },
  buy_request: {
    $jsonSchema: {
      bsonType: "object",
      required: ["Req_ID", "Req_Type", "Req_Status", "U_ID"],
      properties: {
        Req_ID: { bsonType: "string", pattern: "^RQ[0-9]+$" },
        Req_Type: { enum: ["BUY", "OFFER", "SWAP"] },
        Req_Status: { enum: ["PENDING", "ACCEPTED", "REJECTED", "COUNTERED", "COMPLETED", "EXPIRED", "CANCELLED"] },
      },
    },
  },
  rental_item: {
    $jsonSchema: {
      bsonType: "object",
      required: ["RI_ID", "RI_Name", "RI_RatePerDay", "RI_Deposit", "RI_Status", "U_ID"],
      properties: {
        RI_ID: { bsonType: "string", pattern: "^RI[0-9]+$" },
        RI_RatePerDay: { bsonType: ["int", "double"], minimum: 1 },
        RI_Deposit: { bsonType: ["int", "double"], minimum: 0 },
        RI_Status: { enum: ["AVAILABLE", "ON_RENT", "WITHDRAWN", "REMOVED"] },
      },
    },
  },
  rental_booking: {
    $jsonSchema: {
      bsonType: "object",
      required: ["Bk_ID", "Bk_StartDate", "Bk_EndDate", "Bk_Status", "RI_ID", "U_ID"],
      properties: {
        Bk_ID: { bsonType: "string", pattern: "^BK[0-9]+$" },
        Bk_Status: { enum: ["PENDING", "ACCEPTED", "REJECTED", "HANDED_OVER", "RETURNED", "CANCELLED"] },
      },
    },
  },
  bill: {
    $jsonSchema: {
      bsonType: "object",
      required: ["Bill_ID", "Bill_No", "Bill_IssuedOn", "Bill_Amount"],
      properties: {
        Bill_ID: { bsonType: "string", pattern: "^BL[0-9]+$" },
        Bill_No: { bsonType: "string", pattern: "^CK-[0-9]{4}-[0-9]{4,}$" },
        Bill_Amount: { bsonType: ["int", "double"], minimum: 0 },
      },
    },
  },
  rating: {
    $jsonSchema: {
      bsonType: "object",
      required: ["Rat_ID", "Rat_Stars", "Req_ID"],
      properties: {
        Rat_ID: { bsonType: "string", pattern: "^RT[0-9]+$" },
        Rat_Stars: { bsonType: "int", minimum: 1, maximum: 5 },
      },
    },
  },
  report: {
    $jsonSchema: {
      bsonType: "object",
      required: ["Rep_ID", "Rep_Reason", "Rep_Status", "U_ID", "I_ID"],
      properties: {
        Rep_ID: { bsonType: "string", pattern: "^RP[0-9]+$" },
        Rep_Status: { enum: ["OPEN", "RESOLVED", "DISMISSED"] },
      },
    },
  },
  wishlist: {
    $jsonSchema: {
      bsonType: "object",
      required: ["W_ID", "U_ID"],
      properties: {
        W_ID: { bsonType: "string", pattern: "^W[0-9]+$" },
        W_IsActive: { bsonType: ["int", "bool"] },
      },
    },
  },
};

module.exports = { VALIDATORS };
