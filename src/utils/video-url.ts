const tiktokPatterns = [
	/^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
	/^https?:\/\/(vm|vt)\.tiktok\.com\/[\w.-]+/,
	/^https?:\/\/(www\.)?tiktok\.com\/t\/[\w.-]+/,
	/^https?:\/\/m\.tiktok\.com\/v\/\d+/,
];

const facebookPatterns = [
	/^https?:\/\/(www\.)?facebook\.com\/reel\/\d+/,
	/^https?:\/\/(www\.)?facebook\.com\/.+\/videos\/\d+/,
	/^https?:\/\/(www\.)?facebook\.com\/watch\/?\?v=\d+/,
	/^https?:\/\/fb\.watch\/[\w.-]+/,
	/^https?:\/\/m\.facebook\.com\/reel\/\d+/,
	/^https?:\/\/(www\.)?facebook\.com\/.+\/posts\/\d+/,
	/^https?:\/\/(www\.)?facebook\.com\/share\/r\/[\w\d]+(\/)?(\?.*)?$/,
	/^https?:\/\/(www\.)?facebook\.com\/share\/v\/[\w\d]+(\/)?(\?.*)?$/,
];

const youtubePatterns = [
	/^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w.-]+/,
	/^https?:\/\/youtu\.be\/[\w.-]+/,
	/^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w.-]+/,
	/^https?:\/\/m\.youtube\.com\/watch\?v=[\w.-]+/,
];

const douyinPatterns = [
	/^https?:\/\/v\.douyin\.com\/[\w.-]+\/?/,
	/^https?:\/\/(www\.)?douyin\.com\/video\/\d+/,
	/^https?:\/\/m\.douyin\.com\/video\/\d+/,
];

const socialVideoPatterns = [
	...tiktokPatterns,
	...facebookPatterns,
	...youtubePatterns,
	...douyinPatterns,
];

export const isSocialVideoUrl = (url: string) => {
	if (!url) return false;

	return socialVideoPatterns.some((pattern) => pattern.test(url));
};
