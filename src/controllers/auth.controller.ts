import { type Request, type Response } from "express";
import { sendError, sendSuccess } from "@/utils/response";
import { prismaClient } from "@/lib/prisma";

const register = async (req: Request, res: Response) => {
  try {
    const {
      first_name,
      last_name,
      email,
      password,
      phone,
      user_type,
      job_role,
      company: {
        company_name,
        company_size,
        position_in_company,
        company_website,
      },
      experience: {
        experience_level,
        total_published_apps,
        platform_development,
        publish_frequency,
      },
      service_usage,
      communication: { preferred_methods, notifications },
    } = req.body;

    if (!first_name || !last_name || !email || !password || !user_type) {
      return sendError(
        res,
        404,
        "First name, last name, email, password and user type are required"
      );
    }

    const response = await prismaClient?.user?.create({
          first_name,
          last_name,
          email,
          
    })
    return sendSuccess(res, { payload: "Registered successfully" }, "ok");
  } catch (error) {
    return sendError(
      res,
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};
