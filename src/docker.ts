import Docker from "dockerode";

export const docker = new Docker({
	socketPath: `${process.env.HOME}/.docker/run/docker.sock`,
});
