import cloudinary from "../config/cloudinary.js";
import Project from "../models/projectModel.js";
export const createProject = async (req, res) => {
  const project = req.body;
  const images = req.files;
  const errors = [];
  const apiKey = req.apiKey;

  if (!project.title) {
    const message = "Title is required";
    errors.push({ path: "title", message });
  }

  if (!project.description) {
    const message = "Description is required";
    errors.push({ path: "description", message });
  }

  if (!project.technologies) {
    const message = "Technologies is required";
    errors.push({ path: "technologies", message });
  }

  if (!project.cover) {
    const message = "Cover is required";
    errors.push({ path: "images", message });
  }

  if (!project.content) {
    const message = "Content is required";
    errors.push({ path: "content", message });
  }

  if (!project.slug) {
    const message = "Slug is required";
    errors.push({ path: "slug", message });
  } else {
    const existingProject = await Project.findOne({ slug: project.slug });
    if (existingProject) {
      const message = "Slug already exists";
      errors.push({ path: "slug", message });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    const newProject = new Project({ ...project, apiKey });
    const uploadResults = await Promise.all(
      images.map((file, index) => {
        return new Promise((resolve, reject) => {
          const publicId = `${newProject._id}-${index}`;
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: "projects",
              public_id: publicId,
              overwrite: true,
            },
            (error, result) => {
              if (error) {
                console.error("Cloudinary upload error:", error);
                return reject(error);
              }
              resolve({index, url:result.secure_url});
            }
          );

          uploadStream.end(file.buffer);
        });
      })
    );

    const technologies = project.technologies
      .trim()
      .split(",")
      .map((tech) => tech.trim());

    newProject.images = uploadResults;
    newProject.technologies = technologies;
    await newProject.save();

    const responseData = newProject.toObject();
    delete responseData.apiKey;

    res.status(201).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "internal server error" });
    console.log(`Error: ${error.message}`);
  }
};

export const getProjects = async (req, res) => {
  try {
    let { page, limit } = req.query;
    const apiKey = req.apiKey;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;

    const skip = (page - 1) * limit;

    const total = await Project.countDocuments();
    const projects = await Project.find({ apiKey }).skip(skip).limit(limit);
    const summary = projects.map((project) => ({
      id: project._id,
      title: project.title,
      description: project.description,
      tags: project.technologies,
      slug: project.slug,
      published: project.published,
      thumb: project.images[project.cover].url,
    }));
    res.status(200).json({
      success: true,
      data: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        projects: summary,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "internal server error" });
    console.log(`Error: ${error.message}`);
  }
};

export const getProjectDetail = async (req, res) => {
  const { id } = req.params;
  const apiKey = req.apiKey;
  try {
    const project = await Project.findOne({ _id: id, apiKey }).select(
      "-apiKey"
    );
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: "internal sever error" });
    console.log(`Error: ${error.message}`);
  }
};

export const deleteProject = async (req, res) => {
  const { id } = req.params;
  const apiKey = req.apiKey;

  try {
    const data = await Project.findOne({ _id: id, apiKey });
    if (!data) {
      return res.status(404).json({ message: "Project not found" });
    }

    const images = data.images;
    const deleteImage = await Promise.all(
      images.map((imageLink) => {
        const arrayLink = imageLink.split("/");
        const publicId = `${arrayLink[arrayLink.length - 2]}/${
          arrayLink[arrayLink.length - 1].split(".")[0]
        }`;
        return cloudinary.uploader.destroy(publicId);
      })
    );

    await Project.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Project deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "internal server error" });
    console.log(`Error: ${error.message}`);
  }
};

export const updateProject = async (req, res) => {
  const { id } = req.params;
  const project = req.body;
  const images = req.files;
  const apiKey = req.apiKey;

  try {
    const existingProject = await Project.findOne({ _id: id, apiKey });
    if (!existingProject) {
      return res.status(404).json({ message: "Project not found" });
    }
    
    if (images.length > 0) {
      const uploadResults = await Promise.all(
        images.map((file, index) => {
          return new Promise((resolve, reject) => {
            const publicId = `${id}-${index}`;
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: "projects",
                public_id: publicId,
                overwrite: true,
              },
              (error, result) => {
                if (error) {
                  console.error("Cloudinary upload error:", error);
                  return reject(error);
                }
                resolve(result.secure_url);
              }
            );

            uploadStream.end(file.buffer);
          });
        })
      );

      project.images = uploadResults;
    }

    const technologies = Array.isArray(project.technologies)
      ? project.technologies
      : project.technologies
          .trim()
          .split(",")
          .map((tech) => tech.trim());

    project.technologies = technologies;
    project.images = JSON.parse(project.images);
    const updatedProject = await Project.findByIdAndUpdate(id, project, {
      new: true, // Return the updated document
    }).select("-apiKey");
    res.status(200).json({ success: true, data: updatedProject });
  } catch (error) {
    res.status(500).json({ success: false, message: "internal server error" });
    console.log(`Error: ${error.message}`);
  }
};

export const publishProject = async (req, res) => {
  const { id } = req.params;
  try {
    const project = await Project.findById(id);
    project.published = !project.published;
    await project.save();
    res.status(200).json({
      success: true,
      message: `Project ${project.published ? "published" : "unpublished"}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "internal server error" });
    console.log(`Error: ${error.message}`);
  }
};
